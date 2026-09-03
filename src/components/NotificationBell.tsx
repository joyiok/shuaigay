"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface NotifItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

const POLL_MS = 30_000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

/**
 * 通知铃铛:挂载时拉一次列表,之后每 30s 只刷未读数;点开铃铛时刷新列表。
 * 未读数小红点只在 >0 时显示。
 */
export default function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.items)) {
        setItems(data.items);
        setUnread(data.unread ?? 0);
      }
    } catch {
      /* 网络抖动忽略,下一轮轮询再试 */
    }
  }, []);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unread=1", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setUnread(data.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchList();
    const timer = setInterval(fetchUnread, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchList, fetchUnread]);

  // 点外部关掉下拉
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) fetchList();
  }

  async function markRead(id?: string) {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : {}),
      });
      const data = await res.json();
      if (res.ok) {
        setUnread(data.unread ?? 0);
        setItems((prev) =>
          prev.map((it) => (id ? (it.id === id ? { ...it, read: true } : it) : { ...it, read: true })),
        );
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div ref={boxRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={toggle}
        aria-label="通知"
        title="通知"
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          borderRadius: 999,
          border: "1px solid var(--line)",
          background: "var(--panel)",
          color: "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M15 18H9m3.5-14.5A4.5 4.5 0 0 1 17 8v3.1c0 .7.24 1.37.68 1.9l1 1.22a1.2 1.2 0 0 1-.94 1.95H6.26a1.2 1.2 0 0 1-.94-1.95l1-1.22A3.1 3.1 0 0 0 7 11.1V8a4.5 4.5 0 0 1 5.5-4.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              minWidth: 15,
              height: 15,
              padding: "0 4px",
              borderRadius: 999,
              background: "var(--danger)",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              lineHeight: "15px",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: 300,
            maxHeight: 380,
            display: "flex",
            flexDirection: "column",
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "0 10px 30px var(--shadow-md)",
            overflow: "hidden",
            zIndex: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "1px solid var(--line-soft)",
            }}
          >
            <Link href="/notifications" onClick={() => setOpen(false)} style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>通知</Link>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead()}
                style={{ fontSize: 12, color: "var(--violet)", fontWeight: 700 }}
              >
                全部已读
              </button>
            )}
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, overflowY: "auto" }}>
            {items.length === 0 && (
              <li style={{ padding: "28px 14px", textAlign: "center", color: "var(--text-subtle)", fontSize: 12 }}>
                暂无通知
              </li>
            )}
            {items.map((n) => {
              const inner = (
                <div
                  style={{
                    display: "grid",
                    gap: 3,
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--line-soft)",
                    background: n.read ? "transparent" : "var(--brand-soft)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: n.read ? "var(--line-soft)" : "var(--brand)",
                        color: n.read ? "var(--text-muted)" : "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {n.type === "reply" ? "回复" : n.type === "mention" ? "提及" : n.type === "rate" ? "点赞" : n.type === "favorite" ? "收藏" : n.type === "report" ? "举报" : "系统"}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, lineHeight: 1.45 }}>
                    {n.title}
                  </div>
                  {n.body && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {n.body}
                    </div>
                  )}
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} onClick={() => markRead(n.id)} style={{ display: "block" }}>
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              textAlign: "center",
              padding: "10px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              color: "var(--violet)",
              borderTop: "1px solid var(--line-soft)",
              background: "var(--bg-soft)",
            }}
          >
            查看全部通知 →
          </Link>
        </div>
      )}
    </div>
  );
}