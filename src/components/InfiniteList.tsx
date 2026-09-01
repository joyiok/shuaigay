"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { threadHref } from "@/lib/slug";
import { Highlight } from "@/components/Highlight";

/**
 * 渐进增强的无限滚动:
 * - 首屏由服务端渲染好,作为 children(<li> 列表)传进来,JS 禁用时也能看首屏;
 * - 哨兵元素进入视口后自动请求 cursor 接口追加下一页(接口只返回纯数据);
 * - 「下一页」链接始终保留,既是 JS 禁用时的降级分页,也是手动加载入口。
 *
 * variant 决定 JS 追加行怎么画,与各页面服务端行样式保持一致。
 */
interface ThreadItem {
  id: string;
  title: string;
  pinned?: boolean;
  locked?: boolean;
  replyCount: number;
  authorName: string;
  authorAvatarUrl?: string | null;
  lastPostAt: string;
  boardSlug?: string;
  boardName?: string;
}

interface PostItem {
  id: string;
  threadId: string;
  threadTitle: string;
  boardSlug: string;
  boardName: string;
  excerpt: string;
  createdAt: string;
  authorName: string;
  authorAvatarUrl?: string | null;
}

/** 去掉 href 里已有的 cursor 参数,之后每次翻页重新拼接 */
function stripCursor(href: string): string {
  const base = href.replace(/[?&]cursor=[^&#]*/, "");
  return base.replace(/\?&/, "?").replace(/[?&]$/, "");
}

export default function InfiniteList({
  children,
  variant,
  query = "",
  nextHref,
  fetchUrl,
}: {
  children: React.ReactNode;
  variant: "thread" | "post";
  query?: string;
  /** 服务端算出的下一页链接;null 表示没有更多了 */
  nextHref: string | null;
  /** 取下一页数据的接口地址(不含 cursor 参数,组件自己拼) */
  fetchUrl: string;
}) {
  const [cursor, setCursor] = useState<string | null>(() =>
    nextHref ? new URLSearchParams((nextHref.split("?")[1] ?? "")).get("cursor") : null,
  );
  const [items, setItems] = useState<(ThreadItem | PostItem)[]>([]);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const baseHref = useMemo(
    () => (nextHref ? stripCursor(nextHref) : ""),
    [nextHref],
  );

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursor) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const sep = fetchUrl.includes("?") ? "&" : "?";
      const res = await fetch(
        `${fetchUrl}${sep}cursor=${encodeURIComponent(cursor)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return;
      const data: { items?: (ThreadItem | PostItem)[]; nextCursor?: string | null } =
        await res.json();
      const items = data.items;
      if (items?.length) setItems((prev) => [...prev, ...items]);
      setCursor(data.nextCursor ?? null);
    } catch {
      // 网络抖动不吞游标,滚动再触发一次重试
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor, fetchUrl]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore]);

  const linkHref = cursor ? `${baseHref}${baseHref.includes("?") ? "&" : "?"}cursor=${cursor}` : null;

  return (
    <>
      <ul className="post-list">
        {children}
        {items.map((it) =>
          variant === "post"
            ? renderPostRow(it as PostItem, query)
            : renderThreadRow(it as ThreadItem, query),
        )}
        {loading && (
          <li
            className="post-item"
            style={{ justifyContent: "center", color: "var(--text-subtle)", fontSize: 12 }}
          >
            加载中…
          </li>
        )}
      </ul>
      {linkHref && (
        <div
          ref={sentinelRef}
          style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}
        >
          <Link
            href={linkHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 32,
              padding: "0 14px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--panel)",
              fontSize: 13,
            }}
          >
            下一页 →
          </Link>
        </div>
      )}
    </>
  );
}

function renderThreadRow(t: ThreadItem, query: string) {
  const boardBg = (() => {
    const n = t.boardName ?? "";
    if (n.includes("综合")) return { bg: "#f5f3ff", color: "#7c3aed", border: "#ede9fe" };
    if (n.includes("技术")) return { bg: "#eff6ff", color: "#2563eb", border: "#dbeafe" };
    if (n.includes("生活")) return { bg: "#fef3c7", color: "#d97706", border: "#fde68a" };
    if (n.includes("资源")) return { bg: "#ecfdf5", color: "#059669", border: "#a7f3d0" };
    return { bg: "#f5f3ff", color: "#7c3aed", border: "#ede9fe" };
  })();
  return (
    <li key={t.id} className="post-item" style={{ gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "linear-gradient(135deg,#7c3aed,#ec4899)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 13,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {t.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/avatar?file=${encodeURIComponent(t.authorAvatarUrl)}`} alt={t.authorName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          t.authorName.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="post-body" style={{ minWidth: 0, flex: 1 }}>
        <div className="post-title-row" style={{ gap: 8 }}>
          {t.pinned && <span className="topic-badge pinned">置顶</span>}
          {t.locked && <span className="topic-badge" style={{ background: "var(--line-soft)" }}>已锁</span>}
          <Link href={threadHref(t.id, t.title)} className="post-title" style={{ flex: 1, minWidth: 0 }}>
            <Highlight text={t.title} query={query} />
          </Link>
          {t.boardName && (
            <span className="topic-badge" style={{ background: boardBg.bg, color: boardBg.color, border: `1px solid ${boardBg.border}` }}>
              {t.boardName}
            </span>
          )}
        </div>
        <div className="post-meta" style={{ gap: 8, marginTop: 3 }}>
          <span style={{ fontWeight: 500, color: "var(--text-muted)", fontSize: 12 }}>{t.authorName}</span>
          <span style={{ color: "var(--text-subtle)", fontSize: 11 }}>· {formatDate(new Date(t.lastPostAt)).split(" ")[0]}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--bg-soft)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontSize: 11 }}>
            💬 {t.replyCount}
          </span>
        </div>
      </div>
    </li>
  );
}

function renderPostRow(p: PostItem, query: string) {
  return (
    <li key={p.id} className="post-item" style={{ gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "linear-gradient(135deg,#10b981,#06b6d4)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 13,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {p.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/avatar?file=${encodeURIComponent(p.authorAvatarUrl)}`} alt={p.authorName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          p.authorName.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="post-body" style={{ minWidth: 0, flex: 1 }}>
        <div className="post-title-row" style={{ gap: 8 }}>
          <Link href={`${threadHref(p.threadId, p.threadTitle)}#post-${p.id}`} className="post-title" style={{ flex: 1, minWidth: 0 }}>
            <Highlight text={p.threadTitle} query={query} />
          </Link>
          <span className="topic-badge" style={{ background: "var(--bg-soft)", border: "1px solid var(--line)", color: "var(--text-muted)" }}>
            回复
          </span>
        </div>
        <div className="post-excerpt" style={{ marginTop: 4 }}>
          <Highlight text={p.excerpt} query={query} />
        </div>
        <div className="post-meta" style={{ gap: 8, marginTop: 4 }}>
          <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>{p.authorName}</span>
          <span style={{ color: "var(--text-subtle)" }}>· {p.boardName}</span>
          <span style={{ color: "var(--text-subtle)" }}>· {formatDate(new Date(p.createdAt)).split(" ")[0]}</span>
        </div>
      </div>
    </li>
  );
}