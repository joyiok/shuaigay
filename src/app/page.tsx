import Link from "next/link";
import { listAllThreads } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";
import { formatDate } from "@/lib/format";
import UserAvatar from "@/components/UserAvatar";

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
  return (
    <li className="post-item">
      <UserAvatar username={t.authorName} avatarUrl={t.authorAvatarUrl} size={40} radius={10} />
      <div className="post-body">
        <div className="post-title-row" style={{ gap: 8 }}>
          {pinned && <span className="topic-badge pinned">置顶</span>}
          <Link href={`/t/${t.id}`} className="post-title" style={{ flex: 1 }}>
            {t.title}
          </Link>
        </div>
        <div className="post-meta" style={{ gap: 10, marginTop: 6 }}>
          <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>{t.authorName}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-subtle)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "var(--bg-soft)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              {t.views ?? 0}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "var(--panel)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              {t.replyCount}
            </span>
          </span>
          <Link href={`/c/${t.boardSlug}`} style={{ color: "var(--text-subtle)", fontSize: 12 }}>
            {t.boardName}
          </Link>
          <span style={{ color: "var(--text-subtle)" }}>{formatDate(t.lastPostAt)}</span>
        </div>
      </div>
    </li>
  );
}
