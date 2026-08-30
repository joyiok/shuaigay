import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(md: string): string {
  const raw = String(marked.parse(md ?? ""));
  return sanitizeHtml(raw, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "del"],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: [...(sanitizeHtml.defaults.allowedAttributes.a ?? []), "rel"],
      // data-* 留给前端交互（灯箱、埋点）使用
      img: ["src", "alt", "title", "loading", "decoding", "data-*"],
    },
    // 只允许 http(s)/mailto,srcdoc、javascript: 之类全被剥掉
    allowedSchemes: ["http", "https", "mailto"],
    // javascript: 的图片 src 被剥掉后会变成无 src 的空 img,直接整标签移除
    exclusiveFilter(frame) {
      if (frame.tag === "img" && !frame.attribs.src) return true;
      return false;
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer nofollow",
      }),
      // 统一懒加载,长楼翻页时图片按需加载
      img: (_tagName, attribs) => ({
        tagName: "img",
        attribs: { ...attribs, loading: "lazy", decoding: "async" },
      }),
    },
  });
}

/* —— @提及 ——
 * 渲染后的 HTML 里把 @username 换成用户主页链接。
 * 用户名只可能是 [a-zA-Z0-9_-]{3,20}(注册时的约束),替换前必须确认用户存在,
 * 链接内容全部来自服务端存储,不存在注入面。
 */

/** @ 前一字符允许出现的边界字符(中文标点、空格、markdown 符号等),避免误伤邮箱/仓库路径 */
const MENTION_BOUNDARY =
  "[\\s,.;:!?，。；：！？、()（）\\[\\]{}\"'“”‘’<>《》【】*_#~=+|/\\\\-]";
const MENTION_RE = new RegExp(
  `(^|${MENTION_BOUNDARY})@([a-zA-Z0-9_-]{3,20})(?![a-zA-Z0-9_-])`,
  "g",
);

/** 从一批 Markdown 原文里收集候选 @用户名(允许超集,交给后续存在性校验过滤) */
export function collectMentionCandidates(markdowns: readonly string[]): string[] {
  const out = new Set<string>();
  for (const md of markdowns) {
    MENTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MENTION_RE.exec(md ?? ""))) out.add(m[2]);
  }
  return [...out];
}

/**
 * 把渲染后的 HTML 文本节点中的 @用户名 替换为 <a class="post-mention">。
 * - 只替换 existingUsernames 里真实存在的用户
 * - 跳过 <pre>/<code>/<a> 内部,避免破坏代码块和既有链接
 */
export function linkMentions(
  html: string,
  existingUsernames: ReadonlySet<string>,
): string {
  if (existingUsernames.size === 0) return html;

  // 小写归一,方便大小写不敏感的命中,链接用库里的大小写
  const byLower = new Map<string, string>();
  for (const u of existingUsernames) byLower.set(u.toLowerCase(), u);

  // 按标签切块:标签原样输出,只有标签之间的文本参与替换
  const parts = html.split(/(<[^>]*>)/g);
  const depth: Record<string, number> = { pre: 0, code: 0, a: 0 };
  let skip = false;

  const out = parts.map((part) => {
    if (part.startsWith("<")) {
      const m = part.match(/^<\s*(\/?)\s*([a-zA-Z0-9]+)/);
      if (m) {
        const isClose = m[1] === "/";
        const tag = m[2].toLowerCase();
        if (tag in depth && !/\/\s*>$/.test(part)) {
          if (isClose) depth[tag] = Math.max(0, depth[tag] - 1);
          else depth[tag] += 1;
        }
      }
      skip = depth.pre > 0 || depth.code > 0 || depth.a > 0;
      return part;
    }
    if (skip) return part;
    return part.replace(MENTION_RE, (matched, pre, name) => {
      const canon = byLower.get(String(name).toLowerCase());
      return canon
        ? `${pre}<a class="post-mention" href="/u/${canon}">@${canon}</a>`
        : matched;
    });
  });
  return out.join("");
}