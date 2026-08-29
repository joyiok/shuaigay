"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 图片灯箱:挂在帖子页即可,通过事件委托捕获 .post-content img 的点击。
 * 展示原图、背景暗化、点击背景/×/ESC 关闭。
 */
export default function Lightbox() {
  const [src, setSrc] = useState<string | null>(null);
  const [alt, setAlt] = useState("");

  const close = useCallback(() => {
    setSrc(null);
    setAlt("");
  }, []);

  // 委托:正文是服务端渲染的 HTML,用 document 级监听,懒加载的图片也能点
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const img = target?.closest?.(".post-content img") as
        | HTMLImageElement
        | null;
      if (!img) return;
      e.preventDefault();
      setSrc(img.currentSrc || img.src || "");
      setAlt(img.alt ?? "");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // ESC 关闭;打开期间锁住页面滚动
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [src, close]);

  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      className="lightbox-overlay"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(15, 23, 42, 0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        userSelect: "none",
      }}
    >
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "92vw",
          maxHeight: "86vh",
          borderRadius: 10,
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
          objectFit: "contain",
          background: "#000",
        }}
      />
      <button
        type="button"
        aria-label="关闭图片预览"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(255,255,255,0.08)",
          color: "#fff",
          fontSize: 18,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ×
      </button>
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,0.55)",
          fontSize: 12,
          pointerEvents: "none",
        }}
      >
        点击背景或按 ESC 关闭
      </div>
    </div>
  );
}