"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BoardLink {
  slug: string;
  name: string;
}

export default function ForumNav({ boards }: { boards: BoardLink[] }) {
  const pathname = usePathname() ?? "/";

  const activeBoard = (() => {
    const m = pathname.match(/^\/c\/([^/]+)/);
    return m ? m[1] : null;
  })();
  const isHome = pathname === "/" || pathname.startsWith("/?");
  const isFollowing = pathname.startsWith("/following");

  return (
    <nav className="forum-nav" aria-label="顶部版块">
      <Link
        href="/"
        className={`forum-link ${isHome && !activeBoard ? "active" : ""}`}
        aria-current={isHome && !activeBoard ? "page" : undefined}
      >
        全部主题
      </Link>
      <Link
        href="/following"
        className={`forum-link ${isFollowing ? "active" : ""}`}
        aria-current={isFollowing ? "page" : undefined}
      >
        关注
      </Link>
      {boards.map((b) => {
        const active = activeBoard === b.slug;
        return (
          <Link
            key={b.slug}
            href={`/c/${b.slug}`}
            className={`forum-link ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {b.name}
          </Link>
        );
      })}
    </nav>
  );
}
