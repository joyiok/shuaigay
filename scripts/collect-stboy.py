#!/usr/bin/env python3
"""采集 stboy.net 小说区（fid=183）的主题，输出本站「小说导入」可用的 JSON。

只抓公开页面（robots.txt 允许 forum.php?mod=forumdisplay / viewthread），
按「一个主题 = 一部作品、楼主帖子 = 章节」整理，正文转成 Markdown 近似文本。

依赖：pip install requests beautifulsoup4 lxml

用法：
  # 1) 抓主题目录（默认 1-41 页）
  python3 scripts/collect-stboy.py catalog --pages 1-41

  # 2) 看某几个主题能不能用（只看楼主，统计章节与字数）
  python3 scripts/collect-stboy.py probe 67446 101392

  # 3) 生成导入用 JSON（默认过滤 <300 字的楼主短回复）
  python3 scripts/collect-stboy.py works 67446 101392 --out /tmp/stboy/works.json

产物默认落在 /tmp/stboy/（含 cache/ 原始 HTML，可断点续跑）。
注意：导入前请确认内容有权转载；works.json 会自动带 source 字段留痕。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://stboy.net"
FID = 183
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
# 楼主帖里这些节点是站点噪音：干扰码、未登录提示、引用、签名、评分记录等
NOISE_SELECTORS = [
    "font.jammer",
    ".jammer",
    "[style*='display:none']",
    "[style*='display: none']",
    "[style*='visibility:hidden']",
    "[hidden]",
    ".attach_nopermission",
    ".quote",
    "blockquote",
    ".pstatus",
    ".ratelog",
    ".postactions",
    ".sign",
    ".ad",
    "script",
    "style",
    "iframe",
]
HIDDEN_MARKERS = ("如果您要查看本帖隐藏内容请回复", "回复可见", "购买后可见", "需要积分")


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


class Fetcher:
    """带磁盘缓存 + 限速 + 重试的抓取器。"""

    def __init__(self, outdir: Path, delay: float = 1.5):
        self.cache = outdir / "cache"
        self.cache.mkdir(parents=True, exist_ok=True)
        self.delay = delay
        self._last = 0.0
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})

    def get(self, url: str, use_cache: bool = True) -> str:
        key = hashlib.sha1(url.encode("utf-8")).hexdigest()[:20]
        path = self.cache / f"{key}.html"
        if use_cache and path.exists():
            return path.read_text(encoding="utf-8", errors="ignore")

        last_err: Exception | None = None
        for attempt in range(3):
            gap = self.delay - (time.time() - self._last)
            if gap > 0:
                time.sleep(gap + random.uniform(0, 0.35))
            self._last = time.time()
            try:
                resp = self.session.get(url, timeout=30)
                if resp.status_code == 200:
                    resp.encoding = "utf-8"
                    path.write_text(resp.text, encoding="utf-8")
                    return resp.text
                last_err = RuntimeError(f"HTTP {resp.status_code}")
            except Exception as exc:  # noqa: BLE001
                last_err = exc
            time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"抓取失败 {url}: {last_err}")


def soup_of(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def max_page(soup: BeautifulSoup) -> int:
    pages = [1]
    for a in soup.select("div.pg a[href]"):
        m = re.search(r"(?:&amp;|&)page=(\d+)", a.get("href", ""))
        if m:
            pages.append(int(m.group(1)))
    return max(pages)


def parse_catalog(html: str) -> list[dict]:
    soup = soup_of(html)
    rows: list[dict] = []
    for tb in soup.select('tbody[id^="normalthread_"]'):
        tid = int(tb.get("id", "").split("_")[-1])
        link = tb.select_one("a.xst")
        author_link = tb.select_one("td.by cite a")
        num = tb.select_one("td.num")
        replies = views = None
        if num:
            a, em = num.select_one("a"), num.select_one("em")
            if a and a.get_text(strip=True).isdigit():
                replies = int(a.get_text(strip=True))
            if em and em.get_text(strip=True).isdigit():
                views = int(em.get_text(strip=True))
        by_cells = tb.select("td.by")
        uid = None
        if author_link:
            m = re.search(r"uid=(\d+)", author_link.get("href", ""))
            uid = int(m.group(1)) if m else None
        rows.append(
            {
                "tid": tid,
                "title": link.get_text(strip=True) if link else "",
                "author": author_link.get_text(strip=True) if author_link else "",
                "authorUid": uid,
                "replies": replies,
                "views": views,
                "firstPostAt": by_cells[0].get_text(" ", strip=True) if by_cells else "",
                "lastPostAt": by_cells[-1].get_text(" ", strip=True) if len(by_cells) > 1 else "",
            }
        )
    return rows


CJK_RE = re.compile(r"[\u4e00-\u9fff]")

# 干扰码识别：Discuz 会把随机串插在正文里（与“180cm”“C++”这类正常写法区分开）
HARD_SYM = re.compile(r"[\\|_^{}\[\]<>]")
SOFT_SYM = re.compile(r"[&*#@$%+=]")
JUNK_TOKEN = re.compile(r"[A-Za-z0-9&*+#@$%+=!?/\\|_~^{}\[\]<>]{2,16}")


def jammer_token(tok: str) -> bool:
    if HARD_SYM.search(tok):
        return True
    soft = len(SOFT_SYM.findall(tok))
    if soft >= 2:
        return True
    return bool(soft >= 1 and re.match(r"^(?=.*[A-Za-z])(?=.*\d)", tok))


def strip_jammer_inline(line: str) -> str:
    return JUNK_TOKEN.sub(lambda m: "" if jammer_token(m.group(0)) else m.group(0), line)


def dedupe_paragraphs(text: str, seen: set[str]) -> str:
    """同一作品内重复段落只留第一次（楼主常有重发/复制粘贴）。"""
    out: list[str] = []
    for para in re.split(r"\n{2,}", text):
        key = re.sub(r"\s+", "", para)
        if len(key) >= 30:
            if key in seen:
                continue
            seen.add(key)
        out.append(para)
    return "\n\n".join(out).strip()


def jammer_line(line: str) -> bool:
    """Discuz 干扰码：无中文、短、符号/单字母片段密集的杂串行。"""
    s = line.strip()
    if not s or CJK_RE.search(s) or len(s) > 48:
        return False
    special = sum(s.count(c) for c in "&*~^\\|_$#@%{}[]<>`")
    tokens = s.split()
    short = sum(1 for t in tokens if len(t) <= 2)
    return special >= 3 or (len(tokens) >= 4 and short >= 3)


def clean_body(td) -> str:
    """把 Discuz 的帖子正文转成近似 Markdown 的纯文本。"""
    for sel in NOISE_SELECTORS:
        for el in td.select(sel):
            el.decompose()
    for img in td.find_all("img"):
        img.decompose()
    for a in td.find_all("a"):
        a.unwrap()
    for br in td.find_all("br"):
        br.replace_with("\n")
    for el in td.find_all(["p", "div", "tr", "li"]):
        el.append("\n")
    text = td.get_text()
    text = text.replace("\u00a0", " ").replace("\u3000", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # 去掉常见的编辑留痕 / 站点尾巴
    text = re.sub(r"^本帖最后由.*?编辑\s*$", "", text, flags=re.M)
    text = re.sub(r"^\[?\s*本帖最后由[^\n]*$", "", text, flags=re.M)
    text = re.sub(r"^\s*(附件|本帖最后由|评分|举报|使用道具|返回列表).*$", "", text, flags=re.M)
    text = "\n".join(ln for ln in text.split("\n") if not jammer_line(ln))
    # 残留实体/标签兑底（含数字实体与 Discuz 邮箱混淆占位）
    text = re.sub(r"&#\d{2,6};?", " ", text)
    text = re.sub(r"\[email[^\]]{0,20}protected\]", "", text, flags=re.I)
    for entity, char in (("&nbsp;", " "), ("&amp;", "&"), ("&quot;", '"'), ("&lt;", "<"), ("&gt;", ">"), ("&#39;", "'")):
        text = text.replace(entity, char)
    text = re.sub(r"&[a-zA-Z]{2,8};", " ", text)
    text = re.sub(r"</?[a-zA-Z][^>\n]{0,40}>", "", text)
    # 贴在正文行里的干扰码
    text = "\n".join(strip_jammer_inline(ln) for ln in text.split("\n"))
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_posts(html: str) -> tuple[list[dict], dict]:
    soup = soup_of(html)
    subject = soup.select_one("span#thread_subject") or soup.select_one("#thread_subject")
    title = subject.get_text(strip=True) if subject else (soup.select_one("title").get_text(strip=True) if soup.select_one("title") else "")
    title = re.sub(r"\s*-\s*脚之恋.*$", "", title).strip()
    meta = {"title": title, "authorUid": None, "author": None, "pages": max_page(soup)}
    posts: list[dict] = []
    for div in soup.select('div[id^="post_"]'):
        pid = div.get("id", "")[5:]
        if not pid.isdigit():
            continue
        author_link = div.select_one(".authi a.xw1")
        uid = None
        if author_link:
            m = re.search(r"uid=(\d+)", author_link.get("href", ""))
            uid = int(m.group(1)) if m else None
        date_el = div.select_one(f"#authorposton{pid}") or div.select_one(".authi em")
        body = div.select_one(f"#postmessage_{pid}") or div.select_one('[id^="postmessage_"]')
        raw = body.get_text(" ", strip=True) if body else ""
        posts.append(
            {
                "pid": int(pid),
                "uid": uid,
                "author": author_link.get_text(strip=True) if author_link else "",
                "date": (date_el.get_text(" ", strip=True) if date_el else "").replace("发表于", "").strip(),
                "hidden": any(marker in raw for marker in HIDDEN_MARKERS),
                "text": clean_body(body) if body else "",
            }
        )
        if meta["authorUid"] is None and uid:
            meta["authorUid"] = uid
            meta["author"] = posts[-1]["author"]
    return posts, meta


CHAPTER_RE = re.compile(r"^\s*(?:第\s*[0-9一二三四五六七八九十百千零两]{1,7}\s*[章回节话]|Chapter\s*\d+|\d{1,4}[、.．]\s*\S)", re.I)


def split_chapters(text: str) -> list[str]:
    """一段长文里出现多个「第X章」标题时，按标题切开；否则整段算一章。"""
    lines = text.split("\n")
    idx = [i for i, ln in enumerate(lines) if len(ln.strip()) <= 40 and CHAPTER_RE.match(ln)]
    if len(idx) < 2 or idx[0] > 6:
        return [text]
    chunks = []
    for n, start in enumerate(idx):
        end = idx[n + 1] if n + 1 < len(idx) else len(lines)
        chunk = "\n".join(lines[start:end]).strip()
        if len(chunk) >= 100:
            chunks.append(chunk)
    return chunks or [text]


def split_by_size(text: str, limit: int) -> list[str]:
    """单章超过 limit 字时按段落切开（优先在空行处断），满足本站单章上限。"""
    if len(text) <= limit:
        return [text]
    parts: list[str] = []
    rest = text
    while len(rest) > limit:
        window = rest[:limit]
        cut = window.rfind("\n\n")
        if cut < limit * 0.5:
            cut = window.rfind("\n")
        if cut < limit * 0.5:
            cut = limit
        parts.append(rest[:cut].rstrip())
        rest = rest[cut:].lstrip()
    if rest:
        parts.append(rest)
    return [p for p in parts if p]


def chapter_title(text: str) -> str | None:
    """取章名：正文前几行里第一个像章节标题的行（首帖常带前言）。"""
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()][:4]
    for first in lines:
        first = re.sub(r"^#+\s*", "", first).strip("【】[] ")
        if 2 <= len(first) <= 40 and (CHAPTER_RE.match(first) or first.startswith("《")):
            return first
    return None


def clean_title(raw: str) -> str:
    """去掉转载/连载标记与「（46章在63页600楼）」这类定位注释。"""
    title = raw.strip()
    title = re.sub(r"[【\[][^】\]]{0,12}(?:原创|转载?|连载更新?|独家|首發|首发)[^】\]]{0,12}[】\]]", "", title)
    title = re.sub(r"[（(][^）)]{0,20}(?:\d+\s*章|\d+\s*页|\d+\s*楼)[^）)]{0,20}[）)]", "", title)
    title = re.sub(r"^[\s\-—·、,，]+|[\s\-—·、,，]+$", "", title)
    return title or raw.strip()


def collect_work(fetcher: Fetcher, tid: int, min_chars: int, max_chars: int = 15000, min_total: int = 3000) -> tuple[dict, dict]:
    """抓一个主题，返回 (work, report)。"""
    url = f"{BASE}/forum.php?mod=viewthread&tid={tid}"
    posts, meta = parse_posts(fetcher.get(url))
    op_uid = meta["authorUid"]
    report = {
        "tid": tid,
        "title": meta["title"],
        "author": meta["author"],
        "authorUid": op_uid,
        "pages": meta["pages"],
        "opPostsRaw": 0,
        "opPostsKept": 0,
        "keptChars": 0,
        "hidden": False,
        "skipped": None,
    }
    if not op_uid:
        report["skipped"] = "拿不到楼主 uid"
        return {}, report

    # 只看楼主：请求量从「全楼 N 页」降到「楼主 M 页」
    op_posts: list[dict] = []
    page = 1
    while True:
        op_html = fetcher.get(f"{url}&authorid={op_uid}" + (f"&page={page}" if page > 1 else ""))
        batch, _ = parse_posts(op_html)
        mine = [p for p in batch if p["uid"] == op_uid]
        op_posts.extend(mine)
        if page >= max_page(soup_of(op_html)):
            break
        page += 1
        if page > 40:
            break

    # 去重（同一帖可能跨页出现）+ 按时间顺序
    seen: set[int] = set()
    op_posts = [p for p in op_posts if not (p["pid"] in seen or seen.add(p["pid"]))]
    report["opPostsRaw"] = len(op_posts)
    report["hidden"] = any(p["hidden"] for p in op_posts)

    chapters: list[dict] = []
    seen_paras: set[str] = set()
    raw_chars = 0
    for p in op_posts:
        text = p["text"]
        if len(text) < min_chars:
            continue
        raw_chars += len(text)
        text = dedupe_paragraphs(text, seen_paras)
        for chunk in split_chapters(text):
            title = chapter_title(chunk)
            for n, piece in enumerate(split_by_size(chunk, max_chars)):
                # 拆分后的后续段不重复章节名，阅读器会按序号显示
                piece_title = title if n == 0 else None
                if len(piece) < 100:
                    continue
                chapters.append({"title": piece_title, "contentMd": piece} if piece_title else {"contentMd": piece})
    report["opPostsKept"] = len(chapters)
    report["keptChars"] = sum(len(c["contentMd"]) for c in chapters)
    report["dedupedChars"] = max(0, raw_chars - report["keptChars"])

    if report["hidden"]:
        report["skipped"] = "含回复可见/隐藏内容，公开页拿不到正文"
        return {}, report
    if not chapters:
        report["skipped"] = f"楼主正文均不足 {min_chars} 字（多为顶帖/图片帖）"
        return {}, report
    if report["keptChars"] < min_total:
        report["skipped"] = f"全文不足 {min_total} 字（{report['keptChars']}）"
        return {}, report

    work = {
        "importKey": f"stboy:{tid}",
        "title": clean_title(meta["title"])[:120],
        "boardSlug": "novel",
        "source": f"搜同 stboy.net tid={tid}",
        "license": "转载自搜同，版权归原作者；如作者异议请联系删除",
        "chapters": chapters,
    }
    return work, report


def cmd_catalog(args: argparse.Namespace) -> None:
    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    fetcher = Fetcher(outdir, args.delay)
    start, _, end = args.pages.partition("-")
    first, last = int(start), int(end or start)
    rows: list[dict] = []
    for page in range(first, last + 1):
        url = f"{BASE}/forum.php?mod=forumdisplay&fid={FID}" + (f"&page={page}" if page > 1 else "")
        rows.extend(parse_catalog(fetcher.get(url)))
        log(f"目录第 {page} 页完成，累计 {len(rows)} 个主题")
    path = outdir / "catalog.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"写入 {path}（{len(rows)} 个非置顶主题）")


def cmd_probe(args: argparse.Namespace) -> None:
    fetcher = Fetcher(Path(args.out), args.delay)
    for tid in args.tids:
        try:
            _, report = collect_work(fetcher, tid, args.min_chars, args.max_chars, args.min_total)
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"tid": tid, "error": str(exc)}, ensure_ascii=False))
            continue
        print(json.dumps(report, ensure_ascii=False))


def cmd_works(args: argparse.Namespace) -> None:
    outdir = Path(args.out).parent
    fetcher = Fetcher(outdir, args.delay)
    works: list[dict] = []
    reports: list[dict] = []
    for tid in args.tids:
        try:
            work, report = collect_work(fetcher, tid, args.min_chars, args.max_chars, args.min_total)
        except Exception as exc:  # noqa: BLE001
            reports.append({"tid": tid, "error": str(exc)})
            log(f"× {tid} 失败：{exc}")
            continue
        reports.append(report)
        if work:
            works.append(work)
            log(f"√ {tid} 《{report['title']}》 {len(work['chapters'])} 章 / {report['keptChars']} 字")
        else:
            log(f"× {tid} 跳过：{report['skipped']}")
    payload = {"works": works}
    Path(args.out).write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    Path(args.out).with_name("report.json").write_text(json.dumps(reports, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"写入 {args.out}（{len(works)} 部作品）")


def main() -> None:
    parser = argparse.ArgumentParser(description="采集 stboy.net fid=183 小说")
    parser.add_argument("--out", default="/tmp/stboy", help="输出目录（catalog 模式）或 JSON 路径（works 模式）")
    parser.add_argument("--delay", type=float, default=1.5, help="请求间隔秒数，默认 1.5")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("catalog", help="抓主题目录")
    p1.add_argument("--pages", default="1-41", help="页码范围，如 1-41")
    p1.set_defaults(func=cmd_catalog)

    p2 = sub.add_parser("probe", help="探测主题可用性（只看楼主）")
    p2.add_argument("tids", nargs="+", type=int)
    p2.add_argument("--min-chars", type=int, default=300)
    p2.add_argument("--max-chars", type=int, default=15000, help="单章硬拆阈值（本站上限 20000）")
    p2.add_argument("--min-total", type=int, default=3000, help="整部作品最少字数，低于则丢弃")
    p2.set_defaults(func=cmd_probe)

    p3 = sub.add_parser("works", help="生成导入 JSON")
    p3.add_argument("tids", nargs="+", type=int)
    p3.add_argument("--min-chars", type=int, default=300)
    p3.add_argument("--max-chars", type=int, default=15000, help="单章硬拆阈值（本站上限 20000）")
    p3.add_argument("--min-total", type=int, default=3000, help="整部作品最少字数，低于则丢弃")
    p3.add_argument("--out", default="/tmp/stboy/works.json")
    p3.set_defaults(func=cmd_works)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
