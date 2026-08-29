import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { trackAndCountOnline } from "@/lib/online";
import { logoutAction } from "./actions/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: { default: "论坛", template: "%s · 论坛" },
  description: "自研论坛",
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

  // 侧边栏统计
  const [userCount, threadCount, postCount] = await Promise.all([
    db.user.count().catch(() => 0),
    db.thread.count().catch(() => 0),
    db.post.count().catch(() => 0),
  ]);

  return (
    <html lang="zh-CN">
      <body>
        {/* 顶部栏 - 原创极简风格 */}
        <div className="site-header top">
          <div className="bar">
            <Link href="/" className="brand">
              <span className="brand-mark">SG</span> SHUAI GAY
            </Link>
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
            <Link href="/search" className="search-page-link" aria-label="搜索" title="搜索">
              <span className="search-page-fake-input">搜索关键词</span>
              <span className="search-page-fake-icon">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
            </Link>
            <div className="nav-mine" style={{ display: "flex" }}>
              {user ? (
                <>
                  <Link href={`/?u=${encodeURIComponent(user.username)}`} style={{ fontWeight: 600 }}>
                    {user.username}
                  </Link>
                  {user.role === "ADMIN" && (
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
                      padding: "4px 12px",
                      borderRadius: 6,
                      fontWeight: 600,
                    }}
                  >
                    注册
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="wrap">
          <div className="forum-layout forum-layout-has-sidebar">
            <div className="forum-main">
              <div className="home-shell" style={{ padding: 0, overflow: "hidden", border: "none", boxShadow: "none", background: "transparent" }}>
                {children}
              </div>
            </div>

            <aside className="sidebar">
              {/* 用户卡 */}
              <div className="card sidebar-card user-card">
                <div className="user-wrap">
                  {user ? (
                    <>
                      <div className="user-header">
                        <div className="user-avatar-big">
                          {user.username.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="user-name">{user.username}</div>
                          <div className="user-rank">{user.role === "ADMIN" ? "管理员" : "注册会员"}</div>
                        </div>
                      </div>
                      <div className="side-auth">
                        <Link href={`/c/general`} className="ghost">
                          发新帖
                        </Link>
                        <form action={logoutAction}>
                          <button type="submit" className="ghost" style={{ width: "100%" }}>
                            退出
                          </button>
                        </form>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="user-header">
                        <div className="user-avatar-big visitor-avatar">?</div>
                        <div>
                          <div className="user-name">访客</div>
                          <div className="user-rank">请登录后发帖</div>
                        </div>
                      </div>
                      <div className="side-auth">
                        <Link href="/login" className="ghost">
                          登录
                        </Link>
                        <Link href="/register" className="primary">
                          注册
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 版块列表 */}
              <div className="card sidebar-card">
                <div className="quick-wrap">
                  <div className="quick-title">
                    版块列表 <span>{boards.length}</span>
                  </div>
                  <ul className="quick-links">
                    {boards.map((b) => (
                      <li key={b.id}>
                        <Link href={`/c/${b.slug}`}>
                          <span>{b.name}</span>
                          <span className="count">{b._count.threads}</span>
                        </Link>
                      </li>
                    ))}
                    {boards.length === 0 && (
                      <li>
                        <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>暂无版块</span>
                      </li>
                    )}
                  </ul>
                </div>
              </div>

              {/* 社区统计 */}
              <div className="card sidebar-card">
                <div className="quick-wrap">
                  <div className="quick-title">社区统计</div>
                  <ul className="quick-links">
                    <li>
                      <a>
                        <span>注册用户</span>
                        <span className="count">{userCount}</span>
                      </a>
                    </li>
                    <li>
                      <a>
                        <span>主题</span>
                        <span className="count">{threadCount}</span>
                      </a>
                    </li>
                    <li>
                      <a>
                        <span>帖子</span>
                        <span className="count">{postCount}</span>
                      </a>
                    </li>
                    {online !== null && (
                      <li>
                        <a>
                          <span>在线</span>
                          <span className="count" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                            {online}
                          </span>
                        </a>
                      </li>
                    )}
                  </ul>
                </div>
              </div>

              {/* 快捷入口 */}
              <div className="card sidebar-card">
                <div className="quick-wrap">
                  <div className="quick-title">快捷功能</div>
                  <ul className="quick-links">
                    <li>
                      <Link href="/">
                        <span>全部主题</span>
                      </Link>
                    </li>
                    <li>
                      <Link href="/search">
                        <span>搜索</span>
                      </Link>
                    </li>
                    <li>
                      <Link href="/login">
                        <span>登录 / 注册</span>
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <footer className="footer">
          <div className="runtime-info">
            © 2026 SHUAI GAY · 原创极简设计 · 开放 · 克制 · 高效 · {threadCount} 主题
          </div>
        </footer>
      </body>
    </html>
  );
}
