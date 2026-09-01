"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { logoutAction } from "@/app/actions/auth";
import UserAvatar from "@/components/UserAvatar";
import { threadHref } from "@/lib/slug";

interface BoardLink {
  slug: string;
  name: string;
  threads?: number;
}

interface DrawerUser {
  username: string;
  role: string;
}

interface DrawerStats {
  userCount: number;
  threadCount: number;
  postCount: number;
  online: number | null;
}

interface HotTopic {
  id: string;
  title: string;
  replyCount: number;
}

interface ActiveUser {
  username: string;
  avatarUrl: string | null;
}

/**
 * 移动端抽屉菜单(<1020px 显示汉堡按钮):
 * - 汉堡按钮在 .bar 内,点击展开左侧抽屉
 * - 抽屉内含：版块 / 社区数据 / 热门话题 / 活跃用户 / 账户操作
 * - 点击 backdrop、× 或按 Esc 关闭;打开时锁定背景滚动
 * - 用 portal 渲染到 body,避免 sticky 头部 backdrop-filter 影响 fixed 定位
 * - 新增：1020px 下 sidebar 隐藏，抽屉内补充展示侧边栏全部信息（A）
 */
export default function MobileDrawer({
  boards,
  user,
  unreadCount = 0,
  stats,
  hotTopics = [],
  activeUsers = [],
}: {
  boards: BoardLink[];
  user: DrawerUser | null;
  unreadCount?: number;
  stats?: DrawerStats;
  hotTopics?: HotTopic[];
  activeUsers?: ActiveUser[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Esc 关闭 + 锁定背景滚动
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className="nav-burger"
        aria-label="打开菜单"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 5.5h14M3 10h14M3 14.5h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="导航菜单">
            <div className="mobile-drawer-backdrop" onClick={close} />
            <div className="mobile-drawer-panel">
              <div className="mobile-drawer-head">
                <span className="brand-mark">SG</span>
                <span style={{ fontWeight: 850, fontSize: 15, letterSpacing: "0.02em" }}>
                  SHUAI GAY
                </span>
                <button
                  type="button"
                  className="mobile-drawer-close"
                  aria-label="关闭菜单"
                  onClick={close}
                >
                  ×
                </button>
              </div>

              <nav className="mobile-drawer-section" aria-label="版块">
                <div className="mobile-drawer-title">版块</div>
                <Link href="/" className="mobile-drawer-link" onClick={close}>
                  全部主题
                </Link>
                {boards.map((b) => (
                  <Link
                    key={b.slug}
                    href={`/c/${b.slug}`}
                    className="mobile-drawer-link"
                    onClick={close}
                  >
                    <span style={{ flex: 1 }}>{b.name}</span>
                    {typeof b.threads === "number" && (
                      <span style={{ background: "var(--bg-soft)", border: "1px solid var(--line)", borderRadius: 999, padding: "1px 6px", fontSize: 11, color: "var(--text-subtle)" }}>{b.threads}</span>
                    )}
                  </Link>
                ))}
                {boards.length === 0 && (
                  <span
                    className="mobile-drawer-link"
                    style={{ color: "var(--text-subtle)", fontSize: 12 }}
                  >
                    暂无版块
                  </span>
                )}
              </nav>

              {/* 社区数据 — 移动端补充（A） */}
              {stats && (
                <div className="mobile-drawer-section">
                  <div className="mobile-drawer-title">社区数据</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                    <div style={{ textAlign: "center", padding: "8px 4px", borderRadius: 10, background: "var(--bg-soft)", border: "1px solid var(--line-soft)" }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "#ede9fe", color: "#7c3aed", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>👥</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 4 }}>{stats.userCount}</div>
                      <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>用户</div>
                    </div>
                    <div style={{ textAlign: "center", padding: "8px 4px", borderRadius: 10, background: "var(--bg-soft)", border: "1px solid var(--line-soft)" }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "#ecfdf5", color: "#10b981", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>📄</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 4 }}>{stats.threadCount}</div>
                      <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>主题</div>
                    </div>
                    <div style={{ textAlign: "center", padding: "8px 4px", borderRadius: 10, background: "var(--bg-soft)", border: "1px solid var(--line-soft)" }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "#fffbeb", color: "#f59e0b", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>💬</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 4 }}>{stats.postCount}</div>
                      <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>帖子</div>
                    </div>
                    <div style={{ textAlign: "center", padding: "8px 4px", borderRadius: 10, background: "var(--bg-soft)", border: "1px solid var(--line-soft)" }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "#f0fdf4", color: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>●</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 4 }}>{stats.online ?? 1}</div>
                      <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>在线</div>
                    </div>
                  </div>
                </div>
              )}

              {/* 热门话题 — 移动端补充 */}
              {hotTopics.length > 0 && (
                <div className="mobile-drawer-section">
                  <div className="mobile-drawer-title">热门话题</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {hotTopics.slice(0, 5).map((t, idx) => (
                      <Link key={t.id} href={threadHref(t.id, t.title)} onClick={close} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line-soft)", background: "var(--bg-soft)", fontSize: 12, color: "var(--text)", textDecoration: "none", minWidth: 0 }}>
                        <span style={{ width: 18, height: 18, borderRadius: 6, background: idx === 0 ? "#fef3c7" : idx === 1 ? "#ede9fe" : "#f3f4f6", color: idx === 0 ? "#d97706" : idx === 1 ? "#7c3aed" : "var(--text-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{idx + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                        <span style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "1px 6px", fontSize: 11, color: "var(--text-subtle)", flexShrink: 0 }}>💬 {t.replyCount}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* 活跃用户 — 移动端补充 */}
              {activeUsers.length > 0 && (
                <div className="mobile-drawer-section">
                  <div className="mobile-drawer-title">活跃用户</div>
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
                    {activeUsers.slice(0, 8).map((u, i) => (
                      <Link key={u.username + i} href={`/u/${u.username}`} onClick={close} style={{ display: "grid", justifyItems: "center", gap: 4, minWidth: 48, textAlign: "center", textDecoration: "none" }}>
                        <UserAvatar username={u.username} avatarUrl={u.avatarUrl} size={40} radius={10} />
                        <span style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 48, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.username.slice(0, 6)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="mobile-drawer-section">
                <div className="mobile-drawer-title">账户</div>
                {user ? (
                  <>
                    <Link
                      href={`/u/${encodeURIComponent(user.username)}`}
                      className="mobile-drawer-link"
                      onClick={close}
                    >
                      {user.username}
                      {user.role === "ADMIN" && (
                        <span
                          style={{
                            marginLeft: 8,
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
                    </Link>
                    <Link href="/messages" className="mobile-drawer-link" onClick={close}>
                      私信
                      {unreadCount > 0 && (
                        <span
                          style={{
                            marginLeft: "auto",
                            background: "var(--danger)",
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: 999,
                            minWidth: 16,
                            textAlign: "center",
                            lineHeight: 1.5,
                          }}
                        >
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </Link>
                    <Link href="/invite" className="mobile-drawer-link" onClick={close}>
                      邀请
                    </Link>
                    {user.role === "ADMIN" && (
                      <Link href="/admin" className="mobile-drawer-link" onClick={close}>
                        管理
                      </Link>
                    )}
                    <form action={logoutAction} onClick={close}>
                      <button
                        type="submit"
                        className="mobile-drawer-link mobile-drawer-logout"
                      >
                        退出登录
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="mobile-drawer-link" onClick={close}>
                      登录
                    </Link>
                    <Link
                      href="/register"
                      className="mobile-drawer-link primary"
                      onClick={close}
                    >
                      注册
                    </Link>
                  </>
                )}
              </div>

              <div className="mobile-drawer-section" style={{ borderBottom: 0, paddingTop: 10, textAlign: "center", color: "var(--text-subtle)", fontSize: 11 }}>
                SHUAI GAY · 活力渐变 · 1020px 下侧边栏已收纳至此
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
