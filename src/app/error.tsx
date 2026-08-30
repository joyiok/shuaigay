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
          borderRadius: 999,
          background: "#f1f5f9",
          border: "1px solid #e2e8f0",
          display: "grid",
          placeItems: "center",
          color: "#0f172a",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={1.7} />
          <path d="M12 8V13" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" />
        </svg>
      </div>

      <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>出了点问题</h1>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>
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
            background: "#0f172a",
            color: "#fff",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            border: "1px solid #0f172a",
            cursor: "pointer",
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
            background: "#fff",
            color: "#0f172a",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            border: "1px solid #e2e8f0",
          }}
        >
          返回首页
        </a>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>slate-900 · 极简错误态</p>
    </div>
  );
}
