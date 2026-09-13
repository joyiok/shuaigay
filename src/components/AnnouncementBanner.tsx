"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * 全站公告横幅：数据源复用侧栏同一条 announce 版块置顶（layout 已 fetch，无额外 DB）。
 * - 按 thread.id 做 localStorage 关闭记忆，换新公告自动再弹
 * - 纯展示，不拦截主流程；关掉后侧栏仍可进
 */
export default function AnnouncementBanner({
  announcement,
}: {
  announcement: { id: string; title: string; pinned?: boolean } | null;
}) {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    if (!announcement) return;
    try {
      setDismissed(localStorage.getItem(`sg:announce:dismissed:${announcement.id}`) === "1");
    } catch {
      setDismissed(false);
    }
  }, [announcement]);
  if (!announcement || dismissed) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(`sg:announce:dismissed:${announcement.id}`, "1");
    } catch {}
    setDismissed(true);
  };
  return (
    <div
      role="region"
      aria-label="全站公告"
      style={{
        background: "#FFF7E6",
        borderBottom: "1px solid #F0DDAE",
        color: "#7A4D00",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "8px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
        }}
      >
        <span aria-hidden style={{ flexShrink: 0 }}>📢</span>
        <Link
          href={`/t/${announcement.id}`}
          prefetch={false}
          style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#7A4D00", fontWeight: 700 }}
        >
          {announcement.title}
        </Link>
        {announcement.pinned && (
          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, background: "#fff", border: "1px solid #F0DDAE", borderRadius: 999, padding: "1px 7px" }}>
            置顶
          </span>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="关闭公告"
          style={{ flexShrink: 0, border: 0, background: "transparent", color: "#7A4D00", fontSize: 16, lineHeight: 1, padding: 6, cursor: "pointer" }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
