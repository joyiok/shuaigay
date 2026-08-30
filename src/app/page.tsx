import Link from "next/link";
import { listAllThreads } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";
import { formatDate } from "@/lib/format";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor: rawCursor } = await searchParams;
  const { pinned, items, nextCursor } = await listAllThreads(decodeCursor(rawCursor), 20);

  // 兼容旧逻辑：若数据库为空，仍展示友好空态（EmptyState 在 layout 侧边栏已展示版块）
  const isEmpty = pinned.length === 0 && items.length === 0;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* 顶部筛选 - 全站时间线 */}
      <div className="topic-toolbar">
        <div className="tab-bar">
          <Link href="/" className={`tab ${!rawCursor ? "active" : ""}`}>
            全部
          </Link>
          <Link href="/?sort=recent" className="tab">
            最新
          </Link>
          <Link href="/search" className="tab">
            搜索
          </Link>
        </div>
        <Link
          href="/c/general/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 32,
            padding: "0 14px",
            background: "var(--brand)",
            color: "#fff",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          发新帖
        </Link>
      </div>

      {/* 全站帖子 - 只有点板块才过滤，首页永远展示全部 */}
      <ul className="post-list">
        {pinned.map((t) => (
          <ThreadRow key={t.id} t={t} pinned />
        ))}
        {items.map((t) => (
          <ThreadRow key={t.id} t={t} />
        ))}
        {isEmpty && (
          <li className="post-item" style={{ justifyContent: "center", color: "var(--text-subtle)", fontSize: 13, flexDirection: "column", alignItems: "center", gap: 6, padding: "24px 14px" }}>
            <div style={{ fontWeight: 600, color: "var(--text)" }}>还没有帖子</div>
            <div style={{ fontSize: 12 }}>去板块发第一帖，首页会自动聚合全站内容</div>
            <Link href="/c/general" style={{ marginTop: 6, display: "inline-flex", height: 30, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 999, background: "var(--panel)", fontSize: 12 }}>
              去版块看看 →
            </Link>
          </li>
        )}
      </ul>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        {nextCursor ? (
          <Link
            href={`/?cursor=${nextCursor}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 32,
              padding: "0 14px",
              border: "1px solid var(--line)",
              borderRadius: 999,
              background: "var(--panel)",
              fontSize: 13,
            }}
          >
            下一页 →
          </Link>
        ) : (
          <span />
        )}
        {rawCursor && (
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 32,
              padding: "0 14px",
              border: "1px solid var(--line)",
              borderRadius: 999,
              background: "var(--panel)",
              fontSize: 13,
            }}
          >
            回首页
          </Link>
        )}
      </div>

      <div style={{ textAlign: "center", color: "var(--text-subtle)", fontSize: 11, padding: "2px 0 8px" }}>
        首页聚合全站主题 · 点击左侧版块仅看该版块
      </div>
    </div>
  );
}

function ThreadRow({ t, pinned }: { t: any; pinned?: boolean }) {
  const avatarLetter = (t.authorName || "?").slice(0, 1).toUpperCase();
  return (
    <li className="post-item">
      <div className="post-avatar" style={{ overflow: "hidden" }}>
        {t.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.authorAvatarUrl} alt={t.authorName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          avatarLetter
        )}
      </div>
      <div className="post-body">
        <div className="post-title-row">
          {pinned && <span className="topic-badge pinned">置顶</span>}
          <Link href={`/t/${t.id}`} className="post-title">
            {t.title}
          </Link>
          <span className="topic-pages" style={{ fontSize: 11 }}>
            {t.replyCount > 0 ? `${t.replyCount} 回复` : "0 回复"}
          </span>
        </div>
        <div className="post-meta">
          <span>
            <svg className="meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
              <path d="M4 21c1.8-4 4.5-6 8-6s6.2 2 8 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            {t.authorName}
          </span>
          <Link href={`/c/${t.boardSlug}`} style={{ color: "var(--text-subtle)" }}>
            <svg className="meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 5h16v14H4z" stroke="currentColor" strokeWidth="1.7" />
              <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {t.boardName}
          </Link>
          <span>
            <svg className="meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {formatDate(t.lastPostAt)}
          </span>
        </div>
      </div>
      <Link href={`/c/${t.boardSlug}`} className="post-tag">
        {t.boardName}
      </Link>
    </li>
  );
}
