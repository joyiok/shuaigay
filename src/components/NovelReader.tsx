"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface NovelChapter {
  id: string;
  /** 全书章节序号（跨分页连续） */
  index: number;
  title: string;
}

const PAGER_ID = "novel-pager";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 小说阅读器：一章一屏，左右翻页。
 * - 触屏滑动 / 触控板横向滚动：由 scroll-snap 原生完成
 * - 方向键 ← →：翻上一章 / 下一章（焦点在正文里时不劫持）
 * - 目录与底部条：跳到指定章，同步地址栏 #post-<id>，刷新后回到原章
 * 分页场景（50 章/页）在最后一章接「继续阅读」跳到下一页 cursor。
 */
export default function NovelReader({
  chapters,
  threadId,
  hasPrevPage,
  hasNextPage,
  nextHref,
  threadHref,
  resume,
}: {
  chapters: NovelChapter[];
  threadId: string;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  nextHref: string | null;
  threadHref: string;
  /** 上次读到第几章（跨设备），首屏给出「继续阅读」入口 */
  resume?: { chapter: number; href: string } | null;
}) {
  const [currentId, setCurrentId] = useState(() => {
    // 带 #post-xxx 打开时直接定位，避免先渲染第一章再跳
    if (typeof window !== "undefined" && window.location.hash.startsWith("#post-")) {
      const id = window.location.hash.slice(5);
      if (chapters.some((c) => c.id === id)) return id;
    }
    return chapters[0]?.id ?? "";
  });
  const [tocOpen, setTocOpen] = useState(false);
  const [edge, setEdge] = useState<"start" | "end" | null>(null);
  const indexRef = useRef(0);

  const pager = useCallback((): HTMLElement | null => document.getElementById(PAGER_ID), []);

  const goToIndex = useCallback(
    (index: number, behavior?: ScrollBehavior) => {
      const el = pager();
      if (!el) return;
      const clamped = Math.max(0, Math.min(chapters.length - 1, index));
      el.scrollTo({ left: clamped * el.clientWidth, behavior: behavior ?? (prefersReducedMotion() ? "auto" : "smooth") });
    },
    [chapters.length, pager],
  );

  /* 滚动跟随：算出当前第几章，同步高亮、进度与地址栏 */
  useEffect(() => {
    const el = pager();
    if (!el || !chapters.length) return;
    const mountedPath = window.location.pathname;
    let raf = 0;
    const sync = () => {
      const width = el.clientWidth || 1;
      const index = Math.max(0, Math.min(chapters.length - 1, Math.round(el.scrollLeft / width)));
      indexRef.current = index;
      const chapter = chapters[index];
      if (chapter) {
        setCurrentId((prev) => (prev === chapter.id ? prev : chapter.id));
        setEdge(index === 0 ? "start" : index === chapters.length - 1 ? "end" : null);
        const hash = `#post-${chapter.id}`;
        // 只在仍停留在本页时改 hash，避免客户端跳转过程中污染新路由
        if (window.location.pathname === mountedPath && window.location.hash !== hash) {
          window.history.replaceState(null, "", hash);
        }
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };
    sync();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [chapters, pager]);

  /* 带 #post-xxx 打开时定位到该章 */
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith("post-")) return;
    const id = hash.slice(5);
    const index = chapters.findIndex((c) => c.id === id);
    if (index > 0) requestAnimationFrame(() => goToIndex(index, "auto"));
  }, [chapters, goToIndex]);

  /* 方向键翻章：输入框/可编辑区域内不劫持 */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return;
      if (event.key === "ArrowLeft") {
        if (indexRef.current === 0) return;
        event.preventDefault();
        goToIndex(indexRef.current - 1);
      } else if (event.key === "ArrowRight") {
        if (indexRef.current >= chapters.length - 1) {
          if (hasNextPage && nextHref) window.location.href = nextHref;
          return;
        }
        event.preventDefault();
        goToIndex(indexRef.current + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chapters.length, goToIndex, hasNextPage, nextHref]);

  /* 阅读进度上报：翻章后延迟写一次（跨设备可用） */
  useEffect(() => {
    const chapter = chapters.find((c) => c.id === currentId);
    if (!chapter) return;
    const timer = setTimeout(() => {
      void fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, postId: chapter.id, chapter: chapter.index }),
        keepalive: true,
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentId, chapters, threadId]);

  const currentIndex = useMemo(() => Math.max(0, chapters.findIndex((c) => c.id === currentId)), [chapters, currentId]);
  const current = chapters[currentIndex];
  const prev = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const next = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;
  const pct = chapters.length ? Math.round(((currentIndex + 1) / chapters.length) * 100) : 0;

  if (!chapters.length) return null;

  return (
    <div className="novel-reader-tools">
      {resume && resume.chapter > 1 && !chapters.some((c) => c.index === resume.chapter) ? (
        <Link className="novel-resume" href={resume.href} prefetch={false}>
          <span className="novel-resume-label">继续阅读</span>
          <span className="novel-resume-chapter">第 {resume.chapter} 章</span>
          <span className="novel-resume-arrow">→</span>
        </Link>
      ) : null}
      {/* 章节目录 */}
      <div className="card novel-toc" style={{ padding: 14 }}>
        <div className="novel-toc-head">
          <span>
            目录 <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-subtle)" }}>本页 {chapters.length} 章{hasNextPage ? " · 未完" : ""}</span>
          </span>
          <button
            type="button"
            onClick={() => setTocOpen((v) => !v)}
            aria-expanded={tocOpen}
            style={{ fontSize: 12, height: 28, padding: "0 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--text-muted)", cursor: "pointer" }}
          >
            {tocOpen ? "收起目录" : "展开目录"}
          </button>
        </div>
        {tocOpen && (
          <ul className="novel-toc-list">
            {chapters.map((c, i) => (
              <li key={c.id} className="novel-toc-item">
                <a
                  href={`#post-${c.id}`}
                  className={`novel-toc-link ${c.id === currentId ? "current" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    goToIndex(i);
                    setTocOpen(false);
                  }}
                >
                  <span className="novel-toc-index">第 {c.index} 章</span>
                  <span className="novel-toc-title">{c.title}</span>
                  {c.id === currentId && <span aria-hidden="true">●</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 底部翻页条 */}
      <div className="novel-chapter-nav card">
        <div className="novel-nav-info">
          <span className="novel-nav-title">
            第 {current?.index ?? "—"} 章 · {current?.title ?? ""}
          </span>
          <div className="novel-nav-track">
            <div className="novel-nav-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="novel-nav-count" aria-label={`第 ${currentIndex + 1} 章，共 ${chapters.length} 章`}>
          {currentIndex + 1}/{chapters.length}
        </span>
        {prev ? (
          <button type="button" onClick={() => goToIndex(currentIndex - 1)} title="上一章（←）" style={{ cursor: "pointer" }}>
            ← 上一章
          </button>
        ) : hasPrevPage ? (
          <Link href={threadHref} title="回到本页第一章">
            ← 回到开头
          </Link>
        ) : (
          <span style={{ opacity: 0.5, cursor: "not-allowed" }}>已是第一章</span>
        )}
        {next ? (
          <button type="button" onClick={() => goToIndex(currentIndex + 1)} title="下一章（→）" style={{ cursor: "pointer" }}>
            下一章 →
          </button>
        ) : hasNextPage && nextHref ? (
          <Link href={nextHref}>继续阅读 →</Link>
        ) : (
          <span style={{ opacity: 0.5, cursor: "not-allowed" }}>已是最后一章</span>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        当前第 {currentIndex + 1} 章，共 {chapters.length} 章{edge === "end" ? "，" + (hasNextPage ? "可继续阅读下一页" : "全书完") : ""}
      </p>
    </div>
  );
}
