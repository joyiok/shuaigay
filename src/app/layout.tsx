import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { after } from "next/server";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { trackAndCountOnline } from "@/lib/online";
import { recordVisit } from "@/lib/visit-stats";
import { logoutAction } from "./actions/auth";
import { db } from "@/lib/db";
import { threadHref } from "@/lib/slug";
import { formatDate } from "@/lib/format";
import { DEFAULT_SITE_SETTINGS, siteUrl } from "@/lib/site";
import { getCachedActiveUsers, getCachedAnnouncement, getCachedBoards, getCachedCategoryCloud, getCachedHotTopics, getCachedSiteSettings, getCachedStats } from "@/lib/cached";
import MobileDrawer from "@/components/MobileDrawer";
import FloatingNewThread from "@/components/FloatingNewThread";
import UserAvatar from "@/components/UserAvatar";
import NotificationBell from "@/components/NotificationBell";
import SearchAutocomplete from "@/components/SearchAutocomplete";
import WebVitals from "@/components/WebVitals";
import ForumNav from "@/components/ForumNav";

const site = siteUrl();
const siteOrigin = site.origin;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCachedSiteSettings();
  const ogImage = `${siteOrigin}/api/og?title=${encodeURIComponent(settings.siteTitle)}`;
  return {
    metadataBase: site,
    title: { default: settings.siteTitle, template: `%s · ${settings.siteName}` },
    description: settings.siteDescription,
    keywords: [settings.siteName, "论坛", "社区", "技术交流", "综合讨论", "生活分享", "资源互助"],
    authors: [{ name: settings.siteName }],
    creator: settings.siteName,
    category: "community",
    alternates: { canonical: siteOrigin, types: { "application/rss+xml": `${siteOrigin}/rss.xml`, "application/atom+xml": `${siteOrigin}/atom.xml`, "application/feed+json": `${siteOrigin}/feed.json` } },
    icons: settings.logoUrl ? { icon: settings.logoUrl } : undefined,
    openGraph: {
      type: "website",
      siteName: settings.siteName,
      title: settings.siteTitle,
      description: settings.siteDescription,
      locale: "zh_CN",
      url: siteOrigin,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: settings.siteTitle,
      description: settings.siteDescription,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
    verification: {},
  };
}

export const viewport: Viewport = {
  themeColor: "#6951c6",
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

  // 流量统计：只记文档请求（RSC/预取不计），放到响应之后执行，失败不影响渲染
  const reqHeaders = await headers();
  const docPath = reqHeaders.get("x-pathname") ?? "/";
  if (reqHeaders.get("x-doc") === "1") {
    const forwarded = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
    after(() =>
      recordVisit({
        path: docPath,
        country: reqHeaders.get("cf-ipcountry"),
        // CF 实际发的头是 CF-Region / CF-Region-Code（不是文档里的 CF-IPRegion），
        // 三个都读一遍，哪个先有值用哪个
        region: reqHeaders.get("cf-region") ?? reqHeaders.get("cf-ipregion") ?? reqHeaders.get("cf-region-code"),
        city: reqHeaders.get("cf-ipcity"),
        referrer: reqHeaders.get("referer"),
        ua: reqHeaders.get("user-agent"),
        ip: reqHeaders.get("cf-connecting-ip") ?? forwarded ?? null,
      }),
    );
  }

  // —— 性能：板块/统计/热帖/活跃用户走 60s 缓存，避免每请求 5 次 DB（A+B）——
  const [boards, stats, hotTopics, activeUsers, categoryCloud, settings, announcement] = await Promise.all([
    getCachedBoards(),
    getCachedStats(),
    getCachedHotTopics(),
    getCachedActiveUsers(),
    getCachedCategoryCloud(),
    getCachedSiteSettings(),
    getCachedAnnouncement(),
  ]);
  const { userCount, threadCount, postCount } = stats;
  // 「社区公告」入口跟随实际存在的版块：优先 announce，其次按 order 首个
  const announceBoard = boards.find((b) => b.slug === "announce") ?? boards[0] ?? null;

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
    name: settings.siteName,
    url: siteOrigin,
    description: settings.siteDescription,
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
    name: settings.siteName,
    url: siteOrigin,
    logo: settings.logoUrl ? new URL(settings.logoUrl, site).toString() : `${siteOrigin}/og.png`,
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: siteOrigin },
    ],
  };
  const brandMark = settings.siteName === DEFAULT_SITE_SETTINGS.siteName ? "SG" : settings.siteName.slice(0, 2).toUpperCase();

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
            <Link href="/" className="brand" aria-label={`${settings.siteName}首页`}>
              {settings.logoUrl ? <img src={settings.logoUrl} alt="" className="site-logo" /> : <span className="brand-mark">{brandMark}</span>}
              <span style={{ fontFamily: 'var(--font-grotesk), var(--font-plex), sans-serif', letterSpacing: '-0.03em' }}>{settings.siteName}</span>
            </Link>
            <MobileDrawer
              siteName={settings.siteName}
              logoUrl={settings.logoUrl}
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
                  <Link className="nav-user-name" href={`/u/${encodeURIComponent(user.username)}`} style={{ fontWeight: 700, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.username}
                  </Link>
                  <Link href="/settings" style={{ color: "var(--text-muted)", fontWeight: 600, padding: "6px 10px", borderRadius: 999 }} aria-label="账号设置">
                    设置
                  </Link>
                  {user.role === "ADMIN" && (
                    <Link href="/admin" style={{ color: "var(--violet)", fontWeight: 700, padding: "5px 10px", background: "var(--violet-soft)", border: "1px solid #DDD6FE", borderRadius: 999, fontSize: 12 }}>
                      管理
                    </Link>
                  )}
                  {online !== null && (
                    <span className="nav-online" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-subtle)", fontWeight: 500, fontSize: 11.5, background: "var(--bg-soft)", border: "1px solid var(--line-faint)", padding: "3px 9px", borderRadius: 999 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--success)", boxShadow: "0 0 0 3px rgba(22,163,74,0.15)" }} />{online} 在线</span>
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
                    <span className="nav-online" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-subtle)", fontWeight: 500, fontSize: 11.5, background: "var(--bg-soft)", border: "1px solid var(--line-faint)", padding: "3px 9px", borderRadius: 999 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--success)", boxShadow: "0 0 0 3px rgba(22,163,74,0.15)" }} />{online} 在线</span>
                  )}
                  <Link href="/login" style={{ color: "var(--text-muted)", fontWeight: 600, padding: "7px 12px" }}>
                    登录
                  </Link>
                  <Link
                    href="/register"
                    style={{ display: "inline-flex", alignItems: "center", height: 36, padding: "0 16px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--text)", fontSize: 13, fontWeight: 650 }}
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
            <main className="forum-main" id="main-content" tabIndex={-1}>
              <div className="home-shell" style={{ padding: 0, overflow: "hidden", border: "none", boxShadow: "none", background: "transparent" }}>
                {children}
              </div>
            </main>

            <aside className="sidebar" aria-label="侧边栏">
              {/* 彩虹社区欢迎卡 */}
              <div className="welcome-card">
                <img className="welcome-art" src="/art/rainbow-side.webp" alt="" width={1254} height={1254} loading="lazy" aria-hidden="true" />
                <div style={{ position: "relative", zIndex: 1, maxWidth: 220 }}>
                  <h2 className="welcome-title">{settings.siteName} · 彩虹同好</h2>
                  <p className="welcome-copy">认识同频的人，聊喜欢的事，也分享自己的生活。</p>
                  {!user && (
                    <div className="side-auth">
                      <Link href="/login" className="ghost">登录</Link>
                      <Link href="/register" className="primary">免费注册</Link>
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
                  <div className="quick-title">社区数据 <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-subtle)" }}>实时</span></div>
                  <div className="stat-grid">
                    <div className="stat-item">
                      <div className="stat-num">{userCount}</div>
                      <div className="stat-label">成员</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-num">{threadCount}</div>
                      <div className="stat-label">主题</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-num">{postCount}</div>
                      <div className="stat-label">回帖</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-num">{online ?? "—"}</div>
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
                      <Link key={b.id} href={`/c/${b.slug}`} prefetch={false} title={`${b.name} · ${(b as any)._count.threads} 主题`} className="side-chip">
                        <span style={{ fontWeight: 700 }}>{b.name}</span>
                        <span className="count">{(b as any)._count.threads}</span>
                      </Link>
                    ))}
                  </div>
                  {hotTopics.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-subtle)", letterSpacing: "0.06em", marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
                        最新热帖
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {hotTopics.map((t: any, idx: number) => (
                          <Link key={t.id} href={threadHref(t.id, t.title)} prefetch={false} title={t.title} className="side-topic">
                            <span className={`rank${idx === 0 ? " first" : idx < 3 ? " top" : ""}`}>{idx + 1}</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{t.title}</span>
                            <span className="reply-count">{Math.max(0, (t._count?.posts ?? 1) - 1)} 回</span>
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
                  <div className="quick-title">活跃用户 <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-subtle)" }}>社区成员</span> <Link href="/members" prefetch={false} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "var(--brand)" }}>会员目录 →</Link></div>
                  <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
                    {activeUsers.map((u: any, i: number) => (
                      <Link key={u.username + i} href={`/u/${u.username}`} prefetch={false} style={{ display: "grid", justifyItems: "center", gap: 5, minWidth: 52, textAlign: "center", padding: "4px", borderRadius: 12 }}>
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
                            prefetch={false}
                            title={`${c.name} · ${c.board.name} · ${cnt} 主题`}
                            className="tag-chip"
                            style={{ fontSize: size, fontWeight: weight }}
                          >
                            <span className="hash">#</span>
                            {c.name}
                            <span className="count">{cnt}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 社区公告 */}
              {announceBoard && (
                <div className="card">
                  <div className="quick-wrap">
                    <div className="quick-title">社区公告 <Link href={`/c/${announceBoard.slug}`}>更多 ›</Link></div>
                    <Link href={announcement ? threadHref(announcement.id, announcement.title) : `/c/${announceBoard.slug}`} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, background: "#fff", border: "1.5px solid var(--line-faint)", borderRadius: 10, padding: "9px 11px" }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--danger)", boxShadow: "0 0 0 3px var(--danger-soft)", flexShrink: 0 }} />
                      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)", fontWeight: 600 }}>{announcement?.title ?? "版块公告与站点通知"}</span>
                      {announcement?.pinned && <span style={{ background: "var(--danger-soft)", color: "var(--danger)", fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999, border: "1px solid #FECACA" }}>置顶</span>}
                    </Link>
                    <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 8, textAlign: "right", fontFamily: "var(--font-jet)" }}>
                      {announcement ? `${formatDate(announcement.createdAt).split(" ")[0]}${announcement.pinned ? " · 已置顶" : ""}` : "暂无公告"}
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>

        <FloatingNewThread firstBoardSlug={boards[0]?.slug ?? null} />

        <footer className="footer">
          <div className="runtime-info" style={{ fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>© 2026 {settings.siteName}</div>
          <div className="footer-links">
            {/* 页脚纯导航：关预取，之前连 /robots.txt 都在预取 _rsc */}
            <Link href="/" prefetch={false}>首页</Link>
            <span aria-hidden>·</span>
            <Link href="/search" prefetch={false}>搜索</Link>
            <span aria-hidden>·</span>
            <Link href="/sitemap.xml" prefetch={false}>Sitemap</Link>
            <span aria-hidden>·</span>
            <Link href="/robots.txt" prefetch={false}>Robots</Link>
            <span aria-hidden>·</span>
            <Link href="/rss.xml" prefetch={false}>RSS</Link>
            <span aria-hidden>·</span>
            <Link href="/atom.xml" prefetch={false}>Atom</Link>
            <span aria-hidden>·</span>
            <Link href="/feed.json" prefetch={false}>JSON</Link>
            <span aria-hidden>·</span>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </footer>
        {reqHeaders.get("x-doc") === "1" && <WebVitals path={docPath} />}
      </body>
    </html>
  );
}
