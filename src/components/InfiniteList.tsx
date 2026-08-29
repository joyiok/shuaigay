"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
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
  return (
    <li key={t.id} className="post-item">
      <div className="post-avatar">{t.authorName.slice(0, 1).toUpperCase()}</div>
      <div className="post-body">
        <div className="post-title-row">
          {t.pinned && <span className="topic-badge pinned">置顶</span>}
          {t.locked && (
            <span className="topic-badge" style={{ background: "var(--line-soft)" }}>
              已锁
            </span>
          )}
          <Link href={`/t/${t.id}`} className="post-title">
            <Highlight text={t.title} query={query} />
          </Link>
          {t.replyCount > 0 && (
            <span className="topic-pages" style={{ color: "var(--text-subtle)", fontSize: 11 }}>
              {t.replyCount}
            </span>
          )}
        </div>
        <div className="post-meta">
          <span>{t.authorName}</span>
          {t.boardName ? <span>{t.boardName}</span> : null}
          <span>{formatDate(new Date(t.lastPostAt))}</span>
        </div>
      </div>
      <Link href={`/t/${t.id}`} className="post-tag">
        查看
      </Link>
    </li>
  );
}

function renderPostRow(p: PostItem, query: string) {
  return (
    <li key={p.id} className="post-item">
      <div className="post-avatar">{p.authorName.slice(0, 1).toUpperCase()}</div>
      <div className="post-body">
        <div className="post-title-row">
          <Link href={`/t/${p.threadId}#post-${p.id}`} className="post-title">
            <Highlight text={p.threadTitle} query={query} />
          </Link>
          <span className="topic-badge" style={{ background: "var(--line-soft)" }}>
            回复
          </span>
        </div>
        <div className="post-excerpt">
          <Highlight text={p.excerpt} query={query} />
        </div>
        <div className="post-meta">
          <span>{p.authorName}</span>
          <span>{p.boardName}</span>
          <span>{formatDate(new Date(p.createdAt))}</span>
        </div>
      </div>
      <Link href={`/t/${p.threadId}#post-${p.id}`} className="post-tag">
        查看
      </Link>
    </li>
  );
}