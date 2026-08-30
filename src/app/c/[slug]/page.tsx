import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listThreads } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";
import { formatDate } from "@/lib/format";
import InfiniteList from "@/components/InfiniteList";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import type { ThreadListItem } from "@/lib/queries";
import type { Cursor } from "@/lib/cursor";

/** 版块数据加载:合并在 try/catch 外侧,notFound 不被误吞 */
async function loadBoardPage(boardId: string, cursor: Cursor | null) {
  const { pinned, items, nextCursor } = await listThreads(boardId, cursor);
  return { pinned, items, nextCursor };
}

const ERRORS: Record<string, string> = {
  ratelimited: "操作太频繁,请稍后再试",
  invalid: "标题或内容格式不对",
};

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { cursor: rawCursor, error } = await searchParams;
  const board = await db.board.findUnique({ where: { slug } });
  if (!board) notFound();

  let loaded: Awaited<ReturnType<typeof loadBoardPage>>;
  try {
    loaded = await loadBoardPage(board.id, decodeCursor(rawCursor));
  } catch {
    // 数据库暂不可用时展示可重试的错误卡片，而不是整页崩溃
    return <ErrorState title="加载版块失败" description="数据库暂时不可用，请稍后重试或返回首页。" code={500} />;
  }
  const { pinned, items, nextCursor } = loaded;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <Link href={`/c/${board.slug}`} style={{ fontWeight: 600, color: "var(--text)" }}>
          {board.name}
        </Link>
      </div>

      <div className="card" style={{ padding: 14, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{board.name}</h1>
          {board.description && <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>{board.description}</p>}
        </div>
        <Link
          href={`/c/${board.slug}/new`}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            height: 32,
            padding: "0 14px",
            background: "var(--brand)",
            color: "#fff",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          发新帖
        </Link>
      </div>

      {error && ERRORS[error] && (
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          {ERRORS[error]}
        </p>
      )}

      <div className="topic-toolbar">
        <div className="tab-bar">
          <Link href={`/c/${board.slug}`} className={`tab ${!rawCursor ? "active" : ""}`}>
            全部
          </Link>
          <Link href={`/c/${board.slug}`} className="tab">
            热门
          </Link>
        </div>
      </div>

      {nextCursor ? (
        <InfiniteList
          variant="thread"
          nextHref={`/c/${board.slug}?cursor=${nextCursor}`}
          fetchUrl={`/api/threads?board=${board.slug}`}
        >
          {pinned.map((t) => (
            <ThreadRow key={t.id} t={t} pinned />
          ))}
          {items.map((t) => (
            <ThreadRow key={t.id} t={t} />
          ))}
        </InfiniteList>
      ) : pinned.length === 0 && items.length === 0 ? (
        <EmptyState variant="thread" actionLabel="发第一帖" actionHref={`/c/${board.slug}/new`} />
      ) : (
        <ul className="post-list">
          {pinned.map((t) => (
            <ThreadRow key={t.id} t={t} pinned />
          ))}
          {items.map((t) => (
            <ThreadRow key={t.id} t={t} />
          ))}
        </ul>
      )}

      {rawCursor && (
        <div style={{ textAlign: "center" }}>
          <Link
            href={`/c/${board.slug}`}
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
    </div>
  );
}

function ThreadRow({ t, pinned }: { t: ThreadListItem; pinned?: boolean }) {
  const avatarLetter = t.authorName.slice(0, 1).toUpperCase();
  return (
    <li className="post-item">
      <div className="post-avatar" style={{ overflow: "hidden" }}>
        {t.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/avatar?file=${encodeURIComponent(t.authorAvatarUrl)}`} alt={t.authorName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          avatarLetter
        )}
      </div>
      <div className="post-body">
        <div className="post-title-row">
          {pinned && <span className="topic-badge pinned">置顶</span>}
          {t.locked && <span className="topic-badge" style={{ background: "var(--line-soft)" }}>已锁</span>}
          <Link href={`/t/${t.id}`} className="post-title">
            {t.title}
          </Link>
          {t.replyCount > 0 && (
            <span className="topic-pages">
              <svg className="meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M9.5 9h6M9.5 12.5h6M9.5 16h3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {t.replyCount > 20 ? `${Math.ceil((t.replyCount + 1) / 20)}` : ""}
            </span>
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
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {t.views ?? 0} 浏览
          </span>
          <span>
            <svg className="meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
            {t.replyCount}
          </span>
          <span>
            <svg className="meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {formatDate(t.lastPostAt)}
          </span>
        </div>
      </div>
      <Link href={`/t/${t.id}`} className="post-tag">
        查看
      </Link>
    </li>
  );
}
