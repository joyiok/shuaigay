import Link from "next/link";
import { listAllThreads } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";
import { formatDate } from "@/lib/format";
import UserAvatar from "@/components/UserAvatar";
import { threadHref } from "@/lib/slug";

function boardBadge(name: string): { bg: string; color: string; border: string } {
  if (name.includes("综合")) return { bg: "#f5f3ff", color: "#7c3aed", border: "#ede9fe" };
  if (name.includes("技术")) return { bg: "#eff6ff", color: "#2563eb", border: "#dbeafe" };
  if (name.includes("生活")) return { bg: "#fef3c7", color: "#925414", border: "#fde68a" };
  if (name.includes("资源")) return { bg: "#ecfdf5", color: "#24724e", border: "#a7f3d0" };
  if (name.includes("公告")) return { bg: "#fff7ed", color: "#9a481c", border: "#fed7aa" };
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
    <div className="home-feed">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      {/* 欢迎区 */}
      <div className="banner">
        <div className="banner-left">
          <h1 className="banner-title">
            进来坐坐<span>，</span>有话直说
          </h1>
          <p className="banner-sub">不端着 · 不审判 — 吹水、求助、分享，随手丢一个帖子就行</p>
          <div className="banner-features">
            <span className="banner-feature">随便聊 · 想说就说</span>
            <span className="banner-feature">干货 · 有用就上</span>
            <span className="banner-feature">资源 · 互帮互助</span>
            <span className="banner-feature">当自己家 · 别客气</span>
          </div>
        </div>
        <svg className="banner-symbol" viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <path d="M18 22h48a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H40L22 80V68h-4A10 10 0 0 1 8 58V32a10 10 0 0 1 10-10Z" fill="#e2daf2" />
          <path d="M28 14h48a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H62L46 72V60H28a10 10 0 0 1-10-10V24a10 10 0 0 1 10-10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M34 32h36M34 42h23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
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
          <Link href="/hot" className="tab">热榜</Link>
          <Link href="/search?type=post" className="tab">帖子</Link>
          <Link href="/?filter=unreplied" className="tab">
            待回复
          </Link>
        </div>
        <Link href="/c/general/new" className="btn-publish">
          <span aria-hidden>+</span> 发个帖子
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
          <li className="post-item" style={{ justifyContent: "center", color: "var(--text-subtle)", flexDirection: "column", gap: 10, padding: "48px 20px" }}>
            <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 14 }}>还没有帖子</div>
            <div style={{ fontSize: 12 }}>去板块发第一帖，首页会自动聚合全站内容</div>
            <Link href="/c/general" className="tab" style={{ marginTop: 8 }}>
              去版块看看 →
            </Link>
          </li>
        )}
      </ul>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
        {nextCursor ? (
          <Link
            href={`/?cursor=${nextCursor}`}
            className="tab"
            style={{ height: 36, padding: "0 18px" }}
          >
            下一页 →
          </Link>
        ) : (
          <span />
        )}
        {rawCursor && (
          <Link
            href="/"
            className="tab"
            style={{ height: 36, padding: "0 18px" }}
          >
            回首页
          </Link>
        )}
      </div>

      <div className="bottom-banner">
        <div>
          <p className="bottom-banner-title">别憋着，想说就丢上来</p>
          <p className="bottom-banner-copy">水帖也算贡献 — 先发，再慢慢聊</p>
        </div>
        <Link href="/c/general/new" className="btn-publish" style={{ flexShrink: 0, position: "relative", zIndex: 1 }}>
          去发帖 →
        </Link>
      </div>
    </div>
  );
}

function ThreadRow({ t, pinned }: { t: any; pinned?: boolean }) {
  const badge = boardBadge(t.boardName);
  const isPending = t.status === "pending";
  const isHot = t.replyCount > 8;
  return (
    <li className="post-item" style={{ opacity: isPending ? 0.72 : 1 }}>
      <UserAvatar username={t.authorName} avatarUrl={t.authorAvatarUrl} size={38} radius={11} />
      <div className="post-body">
        <div className="post-title-row">
          {pinned && <span className="topic-badge pinned" style={{ flexShrink: 0 }}>置顶</span>}
          {t.digested && <span className="topic-badge" style={{ background: "#FFE58F", border: "1.5px solid var(--line)", color: "var(--text)", fontWeight: 800, flexShrink: 0 }}>精华</span>}
          {isPending && <span className="topic-badge" style={{ background: "#FFF7A8", border: "1.5px solid var(--line)", color: "var(--text)", fontWeight: 800, flexShrink: 0 }}>待审</span>}
          <Link href={threadHref(t.id, t.title)} className="post-title" title={t.title} prefetch={false}>
            {t.title}
          </Link>
        </div>
        <div className="post-meta">
          <span className="topic-badge" style={{ background: badge.bg, color: badge.color }}>{t.boardName}</span>
          <span style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: 12 }}>{t.authorName}</span>
          <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{formatDate(t.lastPostAt).split(" ")[0]}</span>
          {isHot && <span style={{ background: "#FEF3C7", color: "#B45309", border: "1px solid #FDE68A", padding: "1px 7px", borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: "0.02em" }}>热门</span>}
        </div>
      </div>
      <div className="post-right">
        <span className="post-count views" aria-label={`${t.views ?? 0} 次浏览`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
          </svg>
          {t.views ?? 0}
        </span>
        <span className="post-count replies" aria-label={`${t.replyCount} 条回复`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
          {t.replyCount}
        </span>
      </div>
    </li>
  );
}
