import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { trackAndCountOnline } from "@/lib/online";
import { logoutAction } from "./actions/auth";
import { db } from "@/lib/db";
import { threadHref } from "@/lib/slug";
import { siteUrl } from "@/lib/site";
import { getCachedActiveUsers, getCachedBoards, getCachedHotTopics, getCachedStats } from "@/lib/cached";
import MobileDrawer from "@/components/MobileDrawer";
import FloatingNewThread from "@/components/FloatingNewThread";
import UserAvatar from "@/components/UserAvatar";
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
  alternates: { canonical: siteOrigin, types: { "application/rss+xml": `${siteOrigin}/rss.xml` } },
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
  const [boards, stats, hotTopics, activeUsers] = await Promise.all([
    getCachedBoards(),
    getCachedStats(),
    getCachedHotTopics(),
    getCachedActiveUsers(),
  ]);
  const { userCount, threadCount, postCount } = stats;

  // 私信未读数（实时，不缓存）
  let unreadCount = 0;
  if (user) {
    try {
      unreadCount = await db.directMessage.count({
        where: { receiverId: user.id, read: false },
      });
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
              <span className="brand-mark">SG</span> SHUAI <i>GAY</i>
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
            <div className="nav-mine" style={{ display: "flex" }}>
              {user ? (
                <>
                  <Link href={`/u/${encodeURIComponent(user.username)}`} style={{ display: "inline-flex", alignItems: "center" }} aria-label={`${user.username} 头像`}>
                    <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={40} radius={10} />
                  </Link>
                  <Link
                    href="/messages"
                    style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--text-muted)" }}
                  >
                    私信
                    {unreadCount > 0 && (
                      <span
                        style={{
                          marginLeft: 4,
                          background: "var(--danger)",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 5px",
                          borderRadius: 999,
                          minWidth: 16,
                          textAlign: "center",
                          lineHeight: 1.4,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>
                  <Link href={`/u/${encodeURIComponent(user.username)}`} style={{ fontWeight: 600 }}>
                    {user.username}
                  </Link>
                  {user.role === "ADMIN" && (
                    <>
                      <Link href="/admin" style={{ color: "var(--text-muted)" }}>
                        管理
                      </Link>
                      <span
                        style={{
                          background: "var(--inverse)",
                          color: "var(--inverse-text)",
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 999,
                        }}
                      >
                        管理员
                      </span>
                    </>
                  )}
                  {online !== null && (
                    <span style={{ color: "var(--text-subtle)", fontWeight: 400 }}>{online} 人在线</span>
                  )}
                  <form action={logoutAction} style={{ display: "inline" }}>
                    <button type="submit" style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      退出
                    </button>
                  </form>
                </>
              ) : (
                <>
                  {online !== null && (
                    <span style={{ color: "var(--text-subtle)", fontWeight: 400 }}>{online} 人在线</span>
                  )}
                  <Link href="/login" style={{ color: "var(--text-muted)" }}>
                    登录
                  </Link>
                  <Link
                    href="/register"
                    style={{
                      background: "var(--brand)",
                      color: "#fff",
                      padding: "4px 14px",
                      borderRadius: 999,
                      fontWeight: 600,
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>欢迎来到</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--brand)", display: "flex", alignItems: "center", gap: 6 }}>
                    SHUAI GAY 社区 <span>🎉</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>加入我们，发现更多精彩内容</div>
                  {!user && (
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <Link href="/login" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", height: 32, border: "1px solid var(--line)", borderRadius: 999, background: "#fff", fontSize: 13, fontWeight: 600 }}>登录</Link>
                      <Link href="/register" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", height: 32, background: "linear-gradient(135deg,#7c3aed,#ec4899)", color: "#fff", borderRadius: 999, fontSize: 13, fontWeight: 700, boxShadow: "0 4px 12px rgba(124,58,237,0.24)" }}>注册</Link>
                    </div>
                  )}
                  {user && (
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                      <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={28} radius={8} />
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{user.username}</span>
                      <span>· 已登录</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 社区数据 — 4 宫格，参考图 */}
              <div className="card">
                <div className="quick-wrap">
                  <div className="quick-title">社区数据</div>
                  <div className="stat-grid">
                    <div className="stat-item">
                      <div className="stat-icon" style={{ background: "#ede9fe", color: "#7c3aed" }}>👥</div>
                      <div className="stat-num">{userCount}</div>
                      <div className="stat-label">注册用户</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-icon" style={{ background: "#ecfdf5", color: "#10b981" }}>📄</div>
                      <div className="stat-num">{threadCount}</div>
                      <div className="stat-label">主题数</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-icon" style={{ background: "#fffbeb", color: "#f59e0b" }}>💬</div>
                      <div className="stat-num">{postCount}</div>
                      <div className="stat-label">帖子数</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-icon" style={{ background: "#f0fdf4", color: "#16a34a" }}>●</div>
                      <div className="stat-num">{online ?? 1}</div>
                      <div className="stat-label">在线人数</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 热门话题 — 版块 + 热帖分开，信息更清晰 */}
              <div className="card">
                <div className="quick-wrap">
                  <div className="quick-title">热门话题 <Link href="/search" style={{ fontSize: 11, color: "var(--brand)", fontWeight: 500 }}>换一换</Link></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: hotTopics.length ? 12 : 0 }}>
                    {boards.map((b) => (
                      <Link key={b.id} href={`/c/${b.slug}`} title={`${b.name} · ${(b as any)._count.threads} 主题`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg-soft)", border: "1px solid var(--line)", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 500, transition: "all 0.14s" }}>
                        <span style={{ color: "var(--brand)", fontWeight: 700 }}>{b.name}</span>
                        <span style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "1px 6px", fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{(b as any)._count.threads}</span>
                      </Link>
                    ))}
                  </div>
                  {hotTopics.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-subtle)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 3, height: 12, borderRadius: 999, background: "var(--brand)" }} /> 最新热帖
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {hotTopics.map((t: any, idx: number) => (
                          <Link key={t.id} href={threadHref(t.id, t.title)} title={t.title} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 10, border: "1px solid var(--line-soft)", background: "var(--bg-soft)", fontSize: 12, color: "var(--text)", minWidth: 0, transition: "all 0.14s", textDecoration: "none" }}>
                            <span style={{ width: 20, height: 20, borderRadius: 6, background: idx === 0 ? "#fef3c7" : idx === 1 ? "#ede9fe" : "#f3f4f6", color: idx === 0 ? "#d97706" : idx === 1 ? "#7c3aed" : "var(--text-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{idx + 1}</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{t.title}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#fff", border: "1px solid var(--line)", padding: "1px 6px", borderRadius: 999, fontSize: 11, color: "var(--text-subtle)", flexShrink: 0 }}>💬 {Math.max(0, (t._count?.posts ?? 1) - 1)}</span>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 活跃用户 — 参考图 */}
              <div className="card">
                <div className="quick-wrap">
                  <div className="quick-title">活跃用户</div>
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                    {(activeUsers.length ? activeUsers : [{ username: "admin", avatarUrl: null }, { username: "atbr", avatarUrl: null }, { username: "seaf", avatarUrl: null }]).map((u: any, i: number) => (
                      <Link key={u.username + i} href={`/u/${u.username}`} style={{ display: "grid", justifyItems: "center", gap: 4, minWidth: 48, textAlign: "center" }}>
                        <UserAvatar username={u.username} avatarUrl={u.avatarUrl} size={44} radius={12} />
                        <span style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 48, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.username.slice(0, 6)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              {/* 社区公告 */}
              <div className="card">
                <div className="quick-wrap">
                  <div className="quick-title">社区公告 <Link href="/c/general" style={{ fontSize: 11, color: "var(--brand)" }}>更多 ›</Link></div>
                  <Link href="/c/general" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--brand)", flexShrink: 0 }} />
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)", fontWeight: 500 }}>社区发帖规范及注意事项</span>
                    <span style={{ background: "#fef2f2", color: "#ef4444", fontSize: 10, padding: "2px 6px", borderRadius: 999, border: "1px solid #fecaca" }}>置顶</span>
                  </Link>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 6, textAlign: "right" }}>2026-08-20</div>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <FloatingNewThread firstBoardSlug={boards[0]?.slug ?? null} />

        <footer className="footer">
          <div className="runtime-info">© 2026 SHUAI GAY · 开放 · 克制 · 高效</div>
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
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
