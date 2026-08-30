import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { trackAndCountOnline } from "@/lib/online";
import { logoutAction } from "./actions/auth";
import { db } from "@/lib/db";
import { threadHref } from "@/lib/slug";
import MobileDrawer from "@/components/MobileDrawer";
import FloatingNewThread from "@/components/FloatingNewThread";
import UserAvatar from "@/components/UserAvatar";
import SearchAutocomplete from "@/components/SearchAutocomplete";

// 站点绝对地址:生产环境请通过 SITE_URL 环境变量注入,缺省时不影响相对 SEO 配置
const siteUrl = process.env.SITE_URL;

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: { default: "论坛", template: "%s · 论坛" },
  description: "自研论坛",
  openGraph: {
    type: "website",
    siteName: "SHUAI GAY 论坛",
    title: "SHUAI GAY 论坛",
    description: "开放 · 克制 · 高效 —— 原创极简风格的论坛",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary",
    title: "SHUAI GAY 论坛",
    description: "开放 · 克制 · 高效 —— 原创极简风格的论坛",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const online = await trackAndCountOnline(user?.id);

  // 顶部导航与侧边栏共用的版块列表
  const boards = await db.board
    .findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { threads: true } } },
      take: 8,
    })
    .catch(() => [] as never[]);

  // 侧边栏统计 + 热门话题 + 活跃用户
  const [userCount, threadCount, postCount, hotTopics, activeUsers] = await Promise.all([
    db.user.count().catch(() => 0),
    db.thread.count().catch(() => 0),
    db.post.count().catch(() => 0),
    db.thread
      .findMany({
        orderBy: { lastPostAt: "desc" },
        take: 5,
        select: { id: true, title: true, board: { select: { name: true } }, _count: { select: { posts: true } } },
      })
      .catch(() => [] as never[]),
    db.user
      .findMany({
        orderBy: { threads: { _count: "desc" } },
        take: 5,
        select: { username: true, avatarUrl: true },
      })
      .catch(() => [] as never[]),
  ]);

  // 私信未读数（顶部红点）
  let unreadCount = 0;
  if (user) {
    try {
      unreadCount = await db.directMessage.count({
        where: { receiverId: user.id, read: false },
      });
    } catch {}
  }

  return (
    <html lang="zh-CN">
      <body>
        {/* 顶部栏 - 原创极简风格 */}
        <header className="site-header top">
          <div className="bar">
            <Link href="/" className="brand">
              <span className="brand-mark">SG</span> SHUAI <i>GAY</i>
            </Link>
            <MobileDrawer
              boards={boards.map((b) => ({ slug: b.slug, name: b.name }))}
              user={user ? { username: user.username, role: user.role } : null}
              unreadCount={unreadCount}
            />
            <nav className="forum-nav" aria-label="顶部版块">
              <Link href="/" className="forum-link active">
                全部主题
              </Link>
              {boards.map((b) => (
                <Link key={b.id} href={`/c/${b.slug}`} className="forum-link">
                  {b.name}
                </Link>
              ))}
            </nav>
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
            <div className="forum-main">
              <div className="home-shell" style={{ padding: 0, overflow: "hidden", border: "none", boxShadow: "none", background: "transparent" }}>
                {children}
              </div>
            </div>

            <aside className="sidebar">
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

              {/* 热门话题 — 参考图 */}
              <div className="card">
                <div className="quick-wrap">
                  <div className="quick-title">热门话题 <Link href="/search" style={{ fontSize: 11, color: "var(--brand)", fontWeight: 500 }}>换一换</Link></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {boards.map((b) => (
                      <Link key={b.id} href={`/c/${b.slug}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg-soft)", border: "1px solid var(--line)", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
                        <span style={{ color: "var(--brand)", fontWeight: 600 }}>{b.name}</span>
                        <span style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "1px 6px", fontSize: 11 }}>{b._count.threads}</span>
                      </Link>
                    ))}
                    {hotTopics.map((t: any) => (
                      <Link key={t.id} href={threadHref(t.id, t.title)} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "4px 10px", fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.title.slice(0, 8)}
                      </Link>
                    ))}
                  </div>
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
          <div className="runtime-info">© 2026 SHUAI GAY</div>
        </footer>
      </body>
    </html>
  );
}
