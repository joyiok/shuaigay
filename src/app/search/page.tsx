import Link from "next/link";
import { db } from "@/lib/db";
import { searchPosts, searchThreads } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";
import { formatDate } from "@/lib/format";
import { threadHref } from "@/lib/slug";
import { Highlight } from "@/components/Highlight";
import InfiniteList from "@/components/InfiniteList";
import EmptyState from "@/components/EmptyState";
import SearchAutocomplete from "@/components/SearchAutocomplete";
import type { PostSearchItem, ThreadSearchItem } from "@/lib/queries";

export const metadata = {
  title: "搜索",
  description: "搜索主题与回复",
};

const MAX_Q = 100;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; board?: string; type?: string; cursor?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, MAX_Q);
  const boardSlug = sp.board?.trim().slice(0, 64) || undefined;
  const type = sp.type === "post" ? "post" : "thread";
  const cursor = decodeCursor(sp.cursor);

  const boards = await db.board.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { threads: true } } },
  });
  const board = boardSlug
    ? await db.board.findUnique({ where: { slug: boardSlug } })
    : null;

  let threadItems: ThreadSearchItem[] = [];
  let postItems: PostSearchItem[] = [];
  let nextCursor: string | null = null;

  if (q) {
    if (type === "post") {
      const r = await searchPosts(q, board?.id, cursor);
      postItems = r.items;
      nextCursor = r.nextCursor;
    } else {
      const r = await searchThreads(q, board?.id, cursor);
      threadItems = r.items;
      nextCursor = r.nextCursor;
    }
  }

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (boardSlug) baseParams.set("board", boardSlug);
  baseParams.set("type", type);
  const baseQuery = baseParams.toString();

  const rows =
    type === "post"
      ? postItems.map((p) => <PostRow key={p.id} p={p} q={q} />)
      : threadItems.map((t) => <ThreadRow key={t.id} t={t} q={q} />);
  const total = type === "post" ? postItems.length : threadItems.length;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>搜索</span>
      </div>

      {/* 搜索表单 */}
      <form
        action="/search"
        method="get"
        className="card"
        style={{ padding: 14, display: "grid", gap: 10 }}
        role="search"
      >
        <div style={{ display: "flex", gap: 8 }}>
          <SearchAutocomplete
            placeholder="搜索主题与回复…"
            initialValue={q}
            variant="inline"
            standalone={false}
          />
          <button
            type="submit"
            style={{
              flexShrink: 0,
              height: 36,
              padding: "0 18px",
              background: "var(--brand)",
              color: "#fff",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: "1px solid var(--brand)",
            }}
          >
            搜索
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* 重新提交表单时保持当前类型,而不是跳回主题 */}
          <input type="hidden" name="type" value={type} />
          <select
            name="board"
            defaultValue={boardSlug ?? ""}
            style={{
              height: 32,
              padding: "0 10px",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 13,
              background: "var(--panel)",
              color: "var(--text-muted)",
            }}
          >
            <option value="">全部版块</option>
            {boards.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name}（{b._count.threads}）
              </option>
            ))}
          </select>
          <div className="tab-bar" style={{ margin: 0 }}>
            <Link
              href={q ? `/search?q=${encodeURIComponent(q)}${boardSlug ? `&board=${boardSlug}` : ""}&type=thread` : "/search"}
              className={`tab ${type === "thread" ? "active" : ""}`}
            >
              主题
            </Link>
            <Link
              href={q ? `/search?q=${encodeURIComponent(q)}${boardSlug ? `&board=${boardSlug}` : ""}&type=post` : "/search"}
              className={`tab ${type === "post" ? "active" : ""}`}
            >
              回复
            </Link>
          </div>
        </div>
      </form>

      {!q ? (
        <EmptyState
          variant="search"
          title="搜索论坛内容"
          description="输入关键词，可同时检索主题标题、首帖正文与所有回复，支持按版块筛选。"
        />
      ) : (
        <>
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
            关键词 <strong style={{ color: "var(--text)" }}>“{q}”</strong>
            {board ? (
              <>
                {" "}在 <strong style={{ color: "var(--text)" }}>{board.name}</strong>{" "}
              </>
            ) : (
              " " + "全站"
            )}{" "}
            本页 {total} 条{type === "post" ? "回复" : "主题"}
            {cursor ? "（第 2 页起）" : ""}
          </div>

          {total === 0 && !nextCursor ? (
            <EmptyState variant="search" />
          ) : (
            <>
              {nextCursor ? (
                <InfiniteList
                  variant={type === "post" ? "post" : "thread"}
                  query={q}
                  nextHref={`/search?${baseQuery}&cursor=${nextCursor}`}
                  fetchUrl={`/api/threads?${baseQuery}`}
                >
                  {rows}
                </InfiniteList>
              ) : (
                <ul className="post-list">{rows}</ul>
              )}
              {cursor && (
                <div style={{ textAlign: "center" }}>
                  <Link
                    href={`/search?${baseQuery}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 32,
                      padding: "0 14px",
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                      background: "var(--panel)",
                      fontSize: 13,
                    }}
                  >
                    回第一页
                  </Link>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** 主题结果行:复用 post-list / post-item 样式,标题高亮关键词 */
function ThreadRow({ t, q }: { t: ThreadSearchItem; q: string }) {
  return (
    <li className="post-item">
      <div className="post-avatar" style={{ overflow: "hidden" }}>
        {t.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/avatar?file=${encodeURIComponent(t.authorAvatarUrl)}`} alt={t.authorName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          t.authorName.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="post-body">
        <div className="post-title-row">
          {t.pinned && <span className="topic-badge pinned">置顶</span>}
          {t.locked && (
            <span className="topic-badge" style={{ background: "var(--line-soft)" }}>
              已锁
            </span>
          )}
          <Link href={threadHref(t.id, t.title)} className="post-title">
            <Highlight text={t.title} query={q} />
          </Link>
          {t.replyCount > 0 && (
            <span style={{ color: "var(--text-subtle)", fontSize: 11 }}>{t.replyCount} 回复</span>
          )}
        </div>
        <div className="post-meta">
          <span>
            <svg className="meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
              <path d="M4 21c1.8-4 4.5-6 8-6s6.2 2 8 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            {t.authorName}
          </span>
          <span>
            <svg className="meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
            {t.boardName}
          </span>
          <span>{formatDate(t.lastPostAt)}</span>
        </div>
      </div>
      <Link href={threadHref(t.id, t.title)} className="post-tag">
        查看
      </Link>
    </li>
  );
}

/** 回复结果行:主题标题 + 命中摘录,可跳转到具体楼层 */
function PostRow({ p, q }: { p: PostSearchItem; q: string }) {
  return (
    <li className="post-item">
      <div className="post-avatar" style={{ overflow: "hidden" }}>
        {p.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/avatar?file=${encodeURIComponent(p.authorAvatarUrl)}`} alt={p.authorName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          p.authorName.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="post-body">
        <div className="post-title-row">
          <Link href={`${threadHref(p.threadId, p.threadTitle)}#post-${p.id}`} className="post-title">
            <Highlight text={p.threadTitle} query={q} />
          </Link>
          <span className="topic-badge" style={{ background: "var(--line-soft)" }}>
            回复
          </span>
        </div>
        <div className="post-excerpt">
          <Highlight text={p.excerpt} query={q} />
        </div>
        <div className="post-meta">
          <span>{p.authorName}</span>
          <span>{p.boardName}</span>
          <span>{formatDate(p.createdAt)}</span>
        </div>
      </div>
      <Link href={`${threadHref(p.threadId, p.threadTitle)}#post-${p.id}`} className="post-tag">
        查看
      </Link>
    </li>
  );
}