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

  const avatarColors = ["#ef4444", "#10b981", "#f59e0b", "#7c3aed", "#ec4899", "#06b6d4", "#8b5cf6", "#f97316"];
  const getAvatarColor = (name: string) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % avatarColors.length;
    return avatarColors[h]!;
  };
  const boardBadge = (name: string) => {
    if (name.includes("综合")) return { bg: "#f5f3ff", color: "#7c3aed", border: "#ede9fe" };
    if (name.includes("技术")) return { bg: "#eff6ff", color: "#2563eb", border: "#dbeafe" };
    if (name.includes("生活")) return { bg: "#fef3c7", color: "#d97706", border: "#fde68a" };
    if (name.includes("资源")) return { bg: "#ecfdf5", color: "#059669", border: "#a7f3d0" };
    if (name.includes("公告")) return { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" };
    return { bg: "#f5f3ff", color: "#7c3aed", border: "#ede9fe" };
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Banner — 参考图 */}
      <div className="banner">
        <div className="banner-left">
          <h2 className="banner-title">
            连接兴趣<span> · </span>遇见同好<span> · </span>分享精彩
          </h2>
          <p className="banner-sub">在 SHUAI GAY 社区，找到属于你的圈子 👋</p>
          <div className="banner-features">
            <span className="banner-feature"><i>💬</i><span><b>自由交流</b><br />畅所欲言</span></span>
            <span className="banner-feature"><i>📚</i><span><b>知识分享</b><br />共同成长</span></span>
            <span className="banner-feature"><i>📦</i><span><b>资源互助</b><br />共享共赢</span></span>
            <span className="banner-feature"><i>💖</i><span><b>友好社区</b><br />温暖有爱</span></span>
          </div>
        </div>
        <div className="banner-illu" aria-hidden>🌅</div>
      </div>

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
          <Link href="/?sort=hot" className="tab">🔥 热门</Link>
          <Link href="/search?type=post" className="tab">⭐ 精华</Link>
          <Link href="/?filter=unreplied" className="tab">
            待回复
          </Link>
        </div>
        <Link href="/c/general/new" className="btn-publish">
          ✏️ 发布帖子
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

      <div className="bottom-banner">
        <div>
          <div style={{ fontWeight: 800, color: "var(--brand)", fontSize: 14 }}>分享你的想法，遇见志同道合的朋友</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>精彩的讨论正在发生，你的声音很重要 · 😊</div>
        </div>
        <Link href="/c/general/new" className="btn-publish" style={{ flexShrink: 0 }}>
          💬 立即参与讨论
        </Link>
      </div>
    </div>
  );
}

function ThreadRow({ t, pinned }: { t: any; pinned?: boolean }) {
  const bg = getAvatarColor(t.authorName);
  const badge = boardBadge(t.boardName);
  return (
    <li className="post-item" style={{ gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0, overflow: "hidden" }}>
        {t.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.authorAvatarUrl} alt={t.authorName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          t.authorName.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="post-body">
        <div className="post-title-row" style={{ gap: 6 }}>
          <Link href={`/t/${t.id}`} className="post-title" style={{ flex: 1 }}>
            {t.title}
          </Link>
          {pinned && <span className="topic-badge pinned">置顶</span>}
          <span className="topic-badge" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
            {t.boardName}
          </span>
        </div>
        <div className="post-meta" style={{ gap: 8, marginTop: 3 }}>
          <span style={{ fontWeight: 500, color: "var(--text-muted)", fontSize: 12 }}>{t.authorName}</span>
          <span style={{ color: "var(--text-subtle)", fontSize: 11 }}>· {formatDate(t.lastPostAt).split(" ")[0]}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, textAlign: "right" }} className="post-right">
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-subtle)", fontSize: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {t.views ?? 0}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            {t.replyCount}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-subtle)" }}>
          <span style={{ fontWeight: 600, color: "var(--text)" }}>{t.authorName}</span>
          <UserAvatar username={t.authorName} avatarUrl={t.authorAvatarUrl} size={20} radius={6} />
        </div>
      </div>
    </li>
  );
}
