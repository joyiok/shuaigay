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
    <div className="error-shell">
      <div
        aria-hidden="true"
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background: "var(--brand-soft)",
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
        <h1 className="error-title">出了点问题</h1>
        <p className="error-copy">
          页面加载时遇到错误，请重试。若持续出现，可能是网络或服务暂时不可用。
        </p>
        {error?.digest && (
          <p style={{ margin: 0, color: "var(--text-subtle)", fontSize: 11, fontFamily: "var(--font-jet)" }}>digest: {error.digest}</p>
        )}
      </div>

      <div className="error-actions">
        <button type="button" onClick={() => reset()} className="btn-publish">
          重试
        </button>
        <a href="/" className="btn-ghost">
          返回首页
        </a>
      </div>

      <p className="error-tagline">SHUAI GAY · 极简社区</p>
    </div>
  );
}
