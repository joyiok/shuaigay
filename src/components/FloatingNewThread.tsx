"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * 移动端悬浮「发新帖」按钮(仅 <900px 显示,fixed 右下):
 * - 在当前版块页(/c/:slug)时,跳到该版块的 /new
 * - 其他页面跳到首页首个版块的 /new;没有版块时不显示
 * - 已在发帖页(/new)时不显示,避免重复入口
 */
export default function FloatingNewThread({
  firstBoardSlug,
}: {
  firstBoardSlug: string | null;
}) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    if (/\/new\/?$/.test(path)) {
      setHref(null);
      return;
    }
    const m = path.match(/^\/c\/([^/]+)/);
    if (m) {
      setHref(`/c/${m[1]}/new`);
      return;
    }
    setHref(firstBoardSlug ? `/c/${firstBoardSlug}/new` : null);
  }, [firstBoardSlug]);

  if (!href) return null;

  return (
    <Link href={href} className="fab-new" aria-label="发新帖">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
      发新帖
    </Link>
  );
}