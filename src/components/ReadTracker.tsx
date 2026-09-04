"use client";

import { useEffect, useState } from "react";
import {
  findFloorLabel,
  getLocalStorage,
  loadReadPos,
  saveReadPos,
} from "@/lib/draft";

/**
 * 阅读位置:记录滚到页面中部的最深楼层,下次进同一主题时给「继续阅读」 pill。
 * 纯 localStorage,30 天过期;分页后新楼层不在 DOM 里时 pill 自动隐藏。
 */
export default function ReadTracker({ threadId }: { threadId: string }) {
  const [resume, setResume] = useState<{ postId: string; floor: string | null } | null>(null);

  useEffect(() => {
    const store = getLocalStorage();
    const saved = loadReadPos(store, threadId);
    if (saved?.postId) {
      const el = document.getElementById(`post-${saved.postId}`);
      // 存档楼层在当前 DOM 里、且在首屏下方才提示
      if (el && el.getBoundingClientRect().top > window.innerHeight) {
        setResume({ postId: saved.postId, floor: saved.floor });
      }
    }

    const items = Array.from(document.querySelectorAll('li[id^="post-"]'));
    if (typeof IntersectionObserver === "undefined" || items.length === 0) return;
    let lastSave = 0;
    const obs = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        if (now - lastSave < 1000) return;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const li = e.target as HTMLElement;
          const postId = li.id.replace(/^post-/, "");
          if (!postId) continue;
          const labels = Array.from(li.querySelectorAll("span")).map((s) => s.textContent ?? "");
          saveReadPos(store, threadId, { postId, floor: findFloorLabel(labels) });
          lastSave = now;
          break;
        }
      },
      // 只有滚到屏幕中部才算「读到」
      { rootMargin: "-40% 0px -40% 0px" },
    );
    items.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [threadId]);

  if (!resume) return null;
  return (
    <button
      type="button"
      onClick={() => {
        document.getElementById(`post-${resume.postId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        setResume(null);
      }}
      style={{
        position: "fixed",
        bottom: 76,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        height: 36,
        padding: "0 16px",
        borderRadius: 999,
        border: "1.5px solid var(--line)",
        background: "var(--inverse)",
        color: "#FFFBF2",
        fontSize: 13,
        fontWeight: 700,
        boxShadow: "3px 3px 0 rgba(0,0,0,0.25)",
        cursor: "pointer",
      }}
    >
      继续阅读{resume.floor ? ` ${resume.floor}` : ""} ↓
    </button>
  );
}
