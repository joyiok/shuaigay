"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export interface NovelChapter {
  id: string;
  /** 全书章节序号（跨分页连续） */
  index: number;
  title: string;
}

/**
 * 小说阅读器辅助条：章节目录 + 当前章高亮 + 底部「上一章/下一章」。
 * 章节条目就是页面里的 `li[id^="post-"]`，用 IntersectionObserver 跟随滚动。
 * 分页场景下目录只列当前页章节，翻页用「继续阅读」入口（与既有分页一致）。
 */
export default function NovelReader({
  chapters,
  hasPrevPage,
  hasNextPage,
  nextHref,
  threadHref,
}: {
  chapters: NovelChapter[];
  hasPrevPage: boolean;
  hasNextPage: boolean;
  nextHref: string | null;
  threadHref: string;
}) {
  const [currentId, setCurrentId] = useState(chapters[0]?.id ?? "");
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    const ids = new Set(chapters.map((c) => c.id));
    const els = chapters
      .map((c) => document.getElementById(`post-${c.id}`))
      .filter((el): el is HTMLElement => !!el && ids.has(el.id.replace(/^post-/, "")));
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        // 取当前视口内最靠上的章节作为「当前章」
        const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
        if (!visible.length) return;
        visible.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        setCurrentId(visible[0]!.id.replace(/^post-/, ""));
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 1] },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [chapters]);

  const currentIndex = useMemo(() => Math.max(0, chapters.findIndex((c) => c.id === currentId)), [chapters, currentId]);
  const current = chapters[currentIndex];
  const prev = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const next = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;
  const pct = chapters.length ? Math.round(((currentIndex + 1) / chapters.length) * 100) : 0;

  if (!chapters.length) return null;

  const jump = (id: string) => {
    document.getElementById(`post-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="novel-reader-tools">
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
            {chapters.map((c) => (
              <li key={c.id} className="novel-toc-item">
                <a
                  href={`#post-${c.id}`}
                  className={`novel-toc-link ${c.id === currentId ? "current" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    jump(c.id);
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

      {/* 底部阅读条 */}
      <div className="novel-chapter-nav card" style={{ padding: "10px 12px" }}>
        <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 140 }}>
          <span style={{ fontSize: 12, fontWeight: 700, border: "none", background: "transparent", padding: 0 }}>
            第 {current?.index ?? "—"} 章 · {current?.title ?? ""}
          </span>
          <div style={{ height: 4, background: "var(--bg-soft)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand)", borderRadius: 999 }} />
          </div>
        </div>
        {prev ? (
          <button type="button" onClick={() => jump(prev.id)} style={{ cursor: "pointer" }}>
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
          <button type="button" onClick={() => jump(next.id)} style={{ cursor: "pointer" }}>
            下一章 →
          </button>
        ) : hasNextPage && nextHref ? (
          <Link href={nextHref}>继续阅读 →</Link>
        ) : (
          <span style={{ opacity: 0.5, cursor: "not-allowed" }}>已是最后一章</span>
        )}
      </div>
    </div>
  );
}
