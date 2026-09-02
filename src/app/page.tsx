import Link from "next/link";
import { listAllThreads } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";
import { formatDate } from "@/lib/format";
import UserAvatar from "@/components/UserAvatar";
import { threadHref } from "@/lib/slug";

const avatarColors = ["#ef4444", "#10b981", "#f59e0b", "#7c3aed", "#ec4899", "#06b6d4", "#8b5cf6", "#f97316"] as const;
function getAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % avatarColors.length;
  return avatarColors[h]!;
}
function boardBadge(name: string): { bg: string; color: string; border: string } {
  if (name.includes("综合")) return { bg: "#f5f3ff", color: "#7c3aed", border: "#ede9fe" };
  if (name.includes("技术")) return { bg: "#eff6ff", color: "#2563eb", border: "#dbeafe" };
  if (name.includes("生活")) return { bg: "#fef3c7", color: "#d97706", border: "#fde68a" };
  if (name.includes("资源")) return { bg: "#ecfdf5", color: "#059669", border: "#a7f3d0" };
  if (name.includes("公告")) return { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" };
  return { bg: "#f5f3ff", color: "#7c3aed", border: "#ede9fe" };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor: rawCursor } = await searchParams;
  const { pinned, items, nextCursor } = await listAllThreads(decodeCursor(rawCursor), 20);

  // C：首页 ItemList 结构化数据（利于收录，20 条内）
  const siteOrigin = (process.env.SITE_URL ?? "https://forum.example.com").replace(/\/$/, "");
  const allForLd = [...pinned, ...items].slice(0, 20);
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "最新主题 · SHUAI GAY 论坛",
    url: siteOrigin,
    numberOfItems: allForLd.length,
    itemListElement: allForLd.map((t: any, idx: number) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${siteOrigin}${threadHref(t.id, t.title)}`,
      name: t.title,
    })),
  };
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "SHUAI GAY 论坛 · 全部主题",
    description: "综合讨论、技术交流、生活分享与资源互助的极简社区",
    url: siteOrigin,
    isPartOf: { "@type": "WebSite", name: "SHUAI GAY 论坛", url: siteOrigin },
  };

  // 兼容旧逻辑：若数据库为空，仍展示友好空态（EmptyState 在 layout 侧边栏已展示版块）
  const isEmpty = pinned.length === 0 && items.length === 0;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      {/* Banner — 纸质 ZINE 快改 */}
      <div className="banner">
        <div className="banner-left">
          <h2 className="banner-title">
            进来坐坐<span>，</span>有话直说
          </h2>
          <p className="banner-sub">不端着，不审判 — 吹水、求助、分享，随手丢一个帖子就行</p>
          <div className="banner-features">
            <span className="banner-feature"><i>◐</i><span><b>随便聊</b><br />想说就说</span></span>
            <span className="banner-feature"><i>✎</i><span><b>干货</b><br />有用就上</span></span>
            <span className="banner-feature"><i>⧉</i><span><b>资源</b><br />互帮互助</span></span>
            <span className="banner-feature"><i>♡</i><span><b>当自己家</b><br />别客气</span></span>
          </div>
        </div>
        <div className="banner-illu" aria-hidden>✂︎ 纸现场</div>
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
          发个帖子
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

      <div className="bottom-banner" style={{ background: "var(--panel)", border: "2px solid var(--line)", boxShadow: "4px 4px 0 var(--line)", borderRadius: 12 }}>
        <div>
          <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 14, fontFamily: "Space Grotesk, sans-serif" }}>别憋着，想说就丢上来</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, fontFamily: "JetBrains Mono, monospace" }}>水帖也算贡献 — 先发，再慢慢聊</div>
        </div>
        <Link href="/c/general/new" className="btn-publish" style={{ flexShrink: 0 }}>
          去发帖
        </Link>
      </div>
    </div>
  );
}

function ThreadRow({ t, pinned }: { t: any; pinned?: boolean }) {
  const badge = boardBadge(t.boardName);
  return (
    <li className="post-item" style={{ gap: 12 }}>
      <UserAvatar username={t.authorName} avatarUrl={t.authorAvatarUrl} size={36} radius={10} />
      <div className="post-body">
        <div className="post-title-row" style={{ gap: 8, alignItems: "center" }}>
          {pinned && <span className="topic-badge pinned" style={{ flexShrink: 0 }}>置顶</span>}
          <Link href={threadHref(t.id, t.title)} className="post-title" style={{ flex: 1, minWidth: 0 }} title={t.title}>
            {t.title}
          </Link>
          <span className="topic-badge" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, flexShrink: 0 }}>
            {t.boardName}
          </span>
        </div>
        <div className="post-meta" style={{ gap: 8, marginTop: 3 }}>
          <span style={{ fontWeight: 500, color: "var(--text-muted)", fontSize: 12 }}>{t.authorName}</span>
          <span style={{ color: "var(--text-subtle)", fontSize: 11 }}>· {formatDate(t.lastPostAt).split(" ")[0]}</span>
          {t.replyCount > 8 && <span style={{ background: "#fef3c7", color: "#d97706", border: "1px solid #fde68a", padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700 }}>热门</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, textAlign: "right" }} className="post-right">
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-subtle)", fontSize: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--bg-soft)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontSize: 11 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {t.views ?? 0}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--panel)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontSize: 11 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            {t.replyCount}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-subtle)" }}>
          <span style={{ fontWeight: 600, color: "var(--text)", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.authorName}</span>
          <UserAvatar username={t.authorName} avatarUrl={t.authorAvatarUrl} size={20} radius={6} />
        </div>
      </div>
    </li>
  );
}
