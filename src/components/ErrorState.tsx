"use client";

import Link from "next/link";

interface ErrorStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  code?: string | number;
}

export default function ErrorState({
  title = "出了点问题",
  description = "请稍后重试，或返回首页看看。",
  actionLabel = "返回首页",
  actionHref = "/",
  code,
}: ErrorStateProps) {
  return (
    <div
      className="card"
      style={{
        padding: "40px 20px",
        textAlign: "center",
        display: "grid",
        gap: 16,
        justifyItems: "center",
        borderColor: "#e2e8f0",
      }}
      role="alert"
      aria-live="assertive"
    >
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
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.9 }}>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={1.7} />
          <path d="M12 8V13" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" />
        </svg>
      </div>

      <div style={{ display: "grid", gap: 6, justifyItems: "center", maxWidth: 480 }}>
        {code && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#94a3b8",
              textTransform: "uppercase",
            }}
          >
            {typeof code === "number" ? `ERROR ${code}` : code}
          </span>
        )}
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>{title}</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>{description}</p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
        <Link
          href={actionHref}
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
          }}
        >
          {actionLabel}
        </Link>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 36,
            padding: "0 16px",
            background: "#fff",
            color: "#0f172a",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            border: "1px solid #e2e8f0",
            cursor: "pointer",
          }}
        >
          重试
        </button>
      </div>
    </div>
  );
}
