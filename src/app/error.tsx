"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 极简错误上报，控制台可见即可
    console.error(error);
  }, [error]);

  return (
    <div style={{ display: "grid", gap: 16, justifyItems: "center", padding: "56px 16px 40px", textAlign: "center" }}>
      <div
        aria-hidden="true"
        style={{
          width: 72,
          height: 72,
          borderRadius: 16,
          background: "var(--bg-soft)",
          border: "1px solid var(--line)",
          display: "grid",
          placeItems: "center",
          color: "var(--brand)",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={1.7} />
          <path d="M12 8V13" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" />
        </svg>
      </div>

      <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>出了点问题</h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13, lineHeight: 1.7 }}>
          页面加载时遇到错误，请重试。若持续出现，可能是网络或服务暂时不可用。
        </p>
        {error?.digest && (
          <p style={{ margin: 0, color: "#94a3b8", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>digest: {error.digest}</p>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 36,
            padding: "0 18px",
            background: "linear-gradient(135deg,#7c3aed,#a855f7)",
            color: "#fff",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            border: "1px solid transparent",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(124,58,237,0.22)",
          }}
        >
          重试
        </button>
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 36,
            padding: "0 18px",
            background: "var(--panel)",
            color: "var(--text)",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            border: "1px solid var(--line)",
            textDecoration: "none",
          }}
        >
          返回首页
        </a>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: "var(--text-subtle)" }}>SHUAI GAY · 活力渐变 · 极简错误态</p>
    </div>
  );
}
