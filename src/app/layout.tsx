import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { trackAndCountOnline } from "@/lib/online";
import { logoutAction } from "./actions/auth";
import { db } from "@/lib/db";
import { threadHref } from "@/lib/slug";
import { siteUrl } from "@/lib/site";
import { getCachedActiveUsers, getCachedBoards, getCachedCategoryCloud, getCachedHotTopics, getCachedStats } from "@/lib/cached";
import MobileDrawer from "@/components/MobileDrawer";
import FloatingNewThread from "@/components/FloatingNewThread";
import UserAvatar from "@/components/UserAvatar";
import NotificationBell from "@/components/NotificationBell";
import SearchAutocomplete from "@/components/SearchAutocomplete";
import ForumNav from "@/components/ForumNav";

const site = siteUrl();
const siteOrigin = site.origin;

export const metadata: Metadata = {
  metadataBase: site,
  title: { default: "SHUAI GAY 论坛 · 开放 · 克制 · 高效", template: "%s · SHUAI GAY 论坛" },
  description: "SHUAI GAY 社区 — 连接兴趣 · 遇见同好 · 分享精彩。综合讨论、技术交流、生活分享与资源互助的极简高性能论坛。",
  keywords: ["SHUAI GAY", "论坛", "社区", "技术交流", "综合讨论", "生活分享", "资源互助"],
  authors: [{ name: "SHUAI GAY" }],
  creator: "SHUAI GAY",
  category: "community",
  alternates: { canonical: siteOrigin, types: { "application/rss+xml": `${siteOrigin}/rss.xml`, "application/atom+xml": `${siteOrigin}/atom.xml`, "application/feed+json": `${siteOrigin}/feed.json` } },
  openGraph: {
    type: "website",
    siteName: "SHUAI GAY 论坛",
    title: "SHUAI GAY 论坛 · 开放 · 克制 · 高效",
    description: "连接兴趣 · 遇见同好 · 分享精彩 — 原创极简风格的高性能社区。",
    locale: "zh_CN",
    url: siteOrigin,
    images: [{ url: `${siteOrigin}/api/og?title=${encodeURIComponent("SHUAI GAY 论坛")}`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SHUAI GAY 论坛",
    description: "开放 · 克制 · 高效 — 原创极简风格的社区。",
    images: [`${siteOrigin}/api/og?title=${encodeURIComponent("SHUAI GAY 论坛")}`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  verification: {},
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const online = await trackAndCountOnline(user?.id);

  // —— 性能：板块/统计/热帖/活跃用户走 60s 缓存，避免每请求 5 次 DB（A+B）——
  const [boards, stats, hotTopics, activeUsers, categoryCloud] = await Promise.all([
    getCachedBoards(),
    getCachedStats(),
    getCachedHotTopics(),
    getCachedActiveUsers(),
    getCachedCategoryCloud(),
  ]);
  const { userCount, threadCount, postCount } = stats;

  // 私信未读数 + 通知未读数（实时，不缓存）
  let unreadCount = 0;
  let notifUnread = 0;
  if (user) {
    try {
      [unreadCount, notifUnread] = await Promise.all([
        db.directMessage.count({
          where: { receiverId: user.id, read: false },
        }),
        db.notification.count({
          where: { userId: user.id, read: false },
        }),
      ]);
    } catch {}
  }

  // —— SEO：站点级 JSON-LD（C）——
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "SHUAI GAY 论坛",
    url: siteOrigin,
    description: "开放 · 克制 · 高效 — 原创极简风格社区",
    inLanguage: "zh-CN",
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteOrigin}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "SHUAI GAY 论坛",
    url: siteOrigin,
    logo: `${siteOrigin}/og.png`,
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: siteOrigin },
    ],
  };

  return (
    <html lang="zh-CN">
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          跳到主内容
        </a>
        {/* 顶部栏 - 原创极简风格 */}
        <header className="site-header top">
          <div className="bar">
            <Link href="/" className="brand" aria-label="SHUAI GAY 论坛首页">
              <span className="brand-mark">SG</span>
              <span style={{ fontFamily: '"Space Grotesk", "IBM Plex Sans", sans-serif', letterSpacing: '-0.03em' }}>SHUAI&nbsp;<i>GAY</i></span>
            </Link>
            <MobileDrawer
              boards={boards.map((b) => ({ slug: b.slug, name: b.name, threads: (b as any)._count?.threads ?? 0 }))}
              user={user ? { username: user.username, role: user.role } : null}
              unreadCount={unreadCount}
              stats={{ userCount, threadCount, postCount, online }}
              hotTopics={hotTopics.map((t: any) => ({ id: t.id, title: t.title, replyCount: Math.max(0, (t._count?.posts ?? 1) - 1) }))}
              activeUsers={activeUsers as any}
            />
            <ForumNav boards={boards.map((b) => ({ slug: b.slug, name: b.name }))} />
            <SearchAutocomplete variant="header" placeholder="搜索关键词" />
            <div className="nav-mine" style={{ display: "flex", alignItems: "center" }}>
              {user ? (
                <>
                  <Link href={`/u/${encodeURIComponent(user.username)}`} style={{ display: "inline-flex", alignItems: "center", borderRadius: 12 }} aria-label={`${user.username} 头像`}>
                    <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={34} radius={10} />
                  </Link>
                  <NotificationBell initialUnread={notifUnread} />
                  <Link
                    href="/messages"
                    style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)", padding: "6px 10px", borderRadius: 999, fontWeight: 600 }}
                  >
                    私信
                    {unreadCount > 0 && (
                      <span
                        style={{
                          background: "var(--danger)",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 800,
                          padding: "1px 6px",
                          borderRadius: 999,
                          minWidth: 18,
                          textAlign: "center",
                          lineHeight: 1.5,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 0 0 2px #fff",
                        }}
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>
                  <Link href={`/u/${encodeURIComponent(user.username)}`} style={{ fontWeight: 700, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.username}
                  </Link>
                  {user.role === "ADMIN" && (
                    <>
                      <Link href="/admin" style={{ color: "var(--violet)", fontWeight: 700, padding: "5px 10px", background: "var(--violet-soft)", border: "1px solid #DDD6FE" }}>
                        管理
                      </Link>
                      <span
                        style={{
                          background: "var(--inverse)",
                          color: "var(--inverse-text)",
                          fontSize: 10,
                          fontWeight: 800,
                          padding: "3px 8px",
                          borderRadius: 999,
                          letterSpacing: "0.04em",
                        }}
                      >
                        管理员
                      </span>
                    </>
                  )}
                  {online !== null && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, background: "var(--bg-soft)", border: "1px solid var(--line-faint)", padding: "4px 10px", borderRadius: 999 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--success)", boxShadow: "0 0 0 3px rgba(22,163,74,0.15)" }} />{online} 在线</span>
                  )}
                  <form action={logoutAction} style={{ display: "inline" }}>
                    <button type="submit" style={{ color: "var(--text-subtle)", fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 999 }}>
                      退出
                    </button>
                  </form>
                </>
              ) : (
                <>
                  {online !== null && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, background: "var(--bg-soft)", border: "1px solid var(--line-faint)", padding: "4px 10px", borderRadius: 999 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--success)", boxShadow: "0 0 0 3px rgba(22,163,74,0.15)" }} />{online} 在线</span>
                  )}
                  <Link href="/login" style={{ color: "var(--text-muted)", fontWeight: 600, padding: "7px 12px" }}>
                    登录
                  </Link>
                  <Link
                    href="/register"
                    style={{
                      background: "linear-gradient(180deg, #26262C, #101014)",
                      color: "#FFFBF2",
                      padding: "8px 18px",
                      borderRadius: 999,
                      fontWeight: 700,
                      border: "2px solid var(--line)",
                      boxShadow: "2px 2px 0 var(--line)",
                    }}
                  >
                    注册
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="wrap">
          <div className="forum-layout forum-layout-has-sidebar">
            <div className="forum-main" id="main-content" tabIndex={-1}>
              <div className="home-shell" style={{ padding: 0, overflow: "hidden", border: "none", boxShadow: "none", background: "transparent" }}>
                {children}
              </div>
            </div>

            <aside className="sidebar" aria-label="侧边栏">
              {/* 欢迎卡 — 参考图 */}
              <div className="welcome-card">
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "var(--violet)", background: "var(--violet-soft)", border: "1px solid #DDD6FE", padding: "3px 10px", borderRadius: 999, marginBottom: 8 }}>✦ 新人必看</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", gap: 6, letterSpacing: "-0.02em" }}>
                    SHUAI GAY 社区
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.6 }}>进来坐坐，有话直说 — 吹水、求助、分享都欢迎</div>
                  {!user && (
                    <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
                      <Link href="/login" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", height: 34, border: "1.5px solid var(--line)", borderRadius: 999, background: "#fff", fontSize: 13, fontWeight: 700, boxShadow: "2px 2px 0 var(--line)" }}>登录</Link>
                      <Link href="/register" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", height: 34, background: "linear-gradient(180deg, #26262C, #101014)", color: "#FFFBF2", border: "1.5px solid var(--line)", borderRadius: 999, fontSize: 13, fontWeight: 700, boxShadow: "2px 2px 0 var(--line)" }}>免费注册 →</Link>
                    </div>
                  )}
                  {user && (
                    <div style={{ marginTop: 13, display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "var(--text-muted)", background: "#fff", border: "1.5px solid var(--line-faint)", borderRadius: 12, padding: "8px 10px" }}>
                      <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={30} radius={9} />
                      <span style={{ fontWeight: 700, color: "var(--text)" }}>{user.username}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--success)", fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--success)" }} />在线</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 社区数据 — 4 宫格 */}
              <div className="card">
                <div className="quick-wrap">
                  <div className="quick-title">社区数据 <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-subtle)", fontFamily: '"JetBrains Mono", monospace' }}>live</span></div>
                  <div className="stat-grid">
                    <div className="stat-item">
                      <div className="stat-icon" style={{ background: "#EDE9FE", color: "#7C3AED" }}>◐</div>
                      <div className="stat-num">{userCount}</div>
                      <div className="stat-label">成员</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-icon" style={{ background: "#ECFDF5", color: "#059669" }}>✎</div>
                      <div className="stat-num">{threadCount}</div>
                      <div className="stat-label">主题</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-icon" style={{ background: "#FFF7D6", color: "#B45309" }}>≋</div>
                      <div className="stat-num">{postCount}</div>
                      <div className="stat-label">回帖</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-icon" style={{ background: "#F0FDF4", color: "#16A34A" }}>●</div>
                      <div className="stat-num">{online ?? 1}</div>
                      <div className="stat-label">在线</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 热门话题 — 版块 + 热帖分开，信息更清晰 */}
              <div className="card">
                <div className="quick-wrap">
                  <div className="quick-title">热门话题 <Link href="/hot">热榜 →</Link></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: hotTopics.length ? 13 : 0 }}>
                    {boards.map((b) => (
                      <Link key={b.id} href={`/c/${b.slug}`} title={`${b.name} · ${(b as any)._count.threads} 主题`} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", border: "1.5px solid var(--line)", borderRadius: 999, padding: "5px 6px 5px 12px", fontSize: 12.5, fontWeight: 600, boxShadow: "2px 2px 0 rgba(22,22,26,0.12)" }}>
                        <span style={{ color: "var(--text)", fontWeight: 700 }}>{b.name}</span>
                        <span style={{ background: "var(--bg-soft)", border: "1px solid var(--line-faint)", borderRadius: 999, padding: "1px 7px", fontSize: 11, color: "var(--text-muted)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{(b as any)._count.threads}</span>
                      </Link>
                    ))}
                  </div>
                  {hotTopics.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-subtle)", letterSpacing: "0.06em", marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 3, height: 12, borderRadius: 999, background: "linear-gradient(180deg, #7C3AED, #EC4899)" }} /> 最新热帖
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {hotTopics.map((t: any, idx: number) => (
                          <Link key={t.id} href={threadHref(t.id, t.title)} title={t.title} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line-faint)", background: idx === 0 ? "#FFFEF5" : "#fff", fontSize: 12.5, color: "var(--text)", minWidth: 0, textDecoration: "none" }}>
                            <span style={{ width: 22, height: 22, borderRadius: 7, background: idx === 0 ? "#FEF3C7" : idx === 1 ? "#EDE9FE" : idx === 2 ? "#FCE7F3" : "#F4F4F5", color: idx === 0 ? "#B45309" : idx === 1 ? "#7C3AED" : idx === 2 ? "#DB2777" : "var(--text-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0, border: "1px solid rgba(22,22,26,0.08)" }}>{idx + 1}</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{t.title}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "var(--bg-soft)", border: "1px solid var(--line-faint)", padding: "2px 7px", borderRadius: 999, fontSize: 11, color: "var(--text-subtle)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{Math.max(0, (t._count?.posts ?? 1) - 1)} 回</span>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 活跃用户 */}
              <div className="card">
                <div className="quick-wrap">
                  <div className="quick-title">活跃用户 <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-subtle)" }}>online</span></div>
                  <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
                    {(activeUsers.length ? activeUsers : [{ username: "admin", avatarUrl: null }, { username: "atbr", avatarUrl: null }, { username: "seaf", avatarUrl: null }]).map((u: any, i: number) => (
                      <Link key={u.username + i} href={`/u/${u.username}`} style={{ display: "grid", justifyItems: "center", gap: 5, minWidth: 52, textAlign: "center", padding: "4px", borderRadius: 12 }}>
                        <span style={{ borderRadius: 14, padding: 2, background: "#fff", border: "1.5px solid var(--line-faint)", display: "inline-flex" }}><UserAvatar username={u.username} avatarUrl={u.avatarUrl} size={42} radius={11} /></span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.username.slice(0, 7)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              {/* 话题标签云 — 全站分类聚合 */}
              {categoryCloud.length > 0 && (
                <div className="card">
                  <div className="quick-wrap">
                    <div className="quick-title">话题标签</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {categoryCloud.map((c: any) => {
                        const cnt = Math.max(0, c._count?.threads ?? 0);
                        const size = cnt >= 50 ? 14 : cnt >= 10 ? 13 : 12;
                        const weight = cnt >= 50 ? 700 : cnt >= 10 ? 600 : 500;
                        return (
                          <Link
                            key={c.id}
                            href={`/c/${c.board.slug}?cat=${c.id}`}
                            title={`${c.name} · ${c.board.name} · ${cnt} 主题`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              background: "var(--bg-soft)",
                              border: "1px solid var(--line)",
                              borderRadius: 999,
                              padding: "4px 10px",
                              fontSize: size,
                              fontWeight: weight,
                              color: "var(--text)",
                              transition: "all 0.14s",
                            }}
                          >
                            <span style={{ color: "var(--brand)" }}>#</span>
                            {c.name}
                            <span style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "0 5px", fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>{cnt}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 社区公告 */}
              <div className="card">
                <div className="quick-wrap">
                  <div className="quick-title">社区公告 <Link href="/c/general">更多 ›</Link></div>
                  <Link href="/c/general" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, background: "#fff", border: "1.5px solid var(--line-faint)", borderRadius: 10, padding: "9px 11px" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--danger)", boxShadow: "0 0 0 3px var(--danger-soft)", flexShrink: 0 }} />
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)", fontWeight: 600 }}>社区发帖规范及注意事项</span>
                    <span style={{ background: "var(--danger-soft)", color: "var(--danger)", fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999, border: "1px solid #FECACA" }}>置顶</span>
                  </Link>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 8, textAlign: "right", fontFamily: '"JetBrains Mono", monospace' }}>2026-08-20 · 已置顶</div>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <FloatingNewThread firstBoardSlug={boards[0]?.slug ?? null} />

        <footer className="footer">
          <div className="runtime-info" style={{ fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>© 2026 SHUAI GAY <span style={{ fontWeight: 500, color: "var(--text-subtle)" }}>· 开放 · 克制 · 高效</span></div>
          <div className="footer-links">
            <Link href="/">首页</Link>
            <span aria-hidden>·</span>
            <Link href="/search">搜索</Link>
            <span aria-hidden>·</span>
            <Link href="/sitemap.xml">Sitemap</Link>
            <span aria-hidden>·</span>
            <Link href="/robots.txt">Robots</Link>
            <span aria-hidden>·</span>
            <Link href="/rss.xml">RSS</Link>
            <span aria-hidden>·</span>
            <Link href="/atom.xml">Atom</Link>
            <span aria-hidden>·</span>
            <Link href="/feed.json">JSON</Link>
            <span aria-hidden>·</span>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
