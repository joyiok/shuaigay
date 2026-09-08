"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * 移动端悬浮「发新帖」按钮(仅 <1020px 显示,fixed 右下):
 * - 只在「浏览内容」的页面出现：首页 / 热榜 / 版块页 / 搜索
 * - 个人中心、设置、会员目录、私信、通知等页面不显示（无发布语义，还会遮挡内容）
 * - 版块页已有显眼的「发新帖」按钮，由 CSS 隐藏本按钮避免重复
 * - 已在发帖页(/new)时不显示
 */
const FAB_PAGES = /^\/($|hot(\/|$)|c\/|search(\/|$))/;
export default function FloatingNewThread({
  firstBoardSlug,
}: {
  firstBoardSlug: string | null;
}) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    if (/\/new\/?$/.test(path) || !FAB_PAGES.test(path)) {
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