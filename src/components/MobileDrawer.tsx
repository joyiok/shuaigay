"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { logoutAction } from "@/app/actions/auth";

interface BoardLink {
  slug: string;
  name: string;
}

interface DrawerUser {
  username: string;
  role: string;
}

/**
 * 移动端抽屉菜单(<900px 显示汉堡按钮):
 * - 汉堡按钮在 .bar 内,点击展开左侧抽屉
 * - 抽屉内含版块链接 + 用户操作(登录 / 注册 / 管理 / 邀请 / 退出)
 * - 点击 backdrop、× 或按 Esc 关闭;打开时锁定背景滚动
 * - 用 portal 渲染到 body,避免 sticky 头部 backdrop-filter 影响 fixed 定位
 */
export default function MobileDrawer({
  boards,
  user,
  unreadCount = 0,
}: {
  boards: BoardLink[];
  user: DrawerUser | null;
  unreadCount?: number;
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
                    {b.name}
                  </Link>
                ))}
                {boards.length === 0 && (
                  <span
                    className="mobile-drawer-link"
                    style={{ color: "var(--text-subtle)", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        background: "#f1f5f9",
                        border: "1px solid #e2e8f0",
                        display: "inline-grid",
                        placeItems: "center",
                        color: "#0f172a",
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
                      </svg>
                    </span>
                    暂无版块
                  </span>
                )}
              </nav>

              <div className="mobile-drawer-section">
                <div className="mobile-drawer-title">用户</div>
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
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}