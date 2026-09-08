"use client";

import { useEffect, useState } from "react";

interface FeedbackProps {
  type: "error" | "success" | "info" | "warning";
  title?: string;
  message: string;
  suggestion?: string;
  autoDismiss?: number;
}

const styles = {
  error: { bg: "var(--danger-soft)", border: "#fecaca", color: "var(--danger)" },
  success: { bg: "#f0fdf4", border: "#86efac", color: "#166534" },
  info: { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af" },
  warning: { bg: "#fffbeb", border: "#fde68a", color: "#92400e" },
};

export default function HumanizedFeedback({ type, title, message, suggestion, autoDismiss }: FeedbackProps) {
  const [visible, setVisible] = useState(true);
  const s = styles[type];

  useEffect(() => {
    if (autoDismiss && type === "success") {
      const t = setTimeout(() => setVisible(false), autoDismiss);
      return () => clearTimeout(t);
    }
  }, [autoDismiss, type]);

  if (!visible) return null;

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span aria-hidden style={{ width: 8, height: 8, marginTop: 5, borderRadius: 999, background: s.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontWeight: 700, fontSize: 12, color: s.color, marginBottom: 2 }}>{title}</div>}
        <div style={{ fontSize: 12, color: s.color, lineHeight: 1.5 }}>{message}</div>
        {suggestion && <div style={{ fontSize: 11, color: s.color, marginTop: 4, opacity: 0.82 }}>{suggestion}</div>}
      </div>
      <button
        onClick={() => setVisible(false)}
        aria-label="关闭"
        style={{ background: "transparent", border: 0, color: s.color, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 2, flexShrink: 0 }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function SubmitButton({ children, loading, ...props }: { children: React.ReactNode; loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} disabled={loading || props.disabled} style={{ ...(props.style as any), opacity: loading ? 0.7 : 1, cursor: loading ? "wait" : "pointer", position: "relative" }}>
      {loading && <span style={{ marginRight: 6, display: "inline-block", width: 12, height: 12, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: 999, animation: "spin 0.7s linear infinite", verticalAlign: "middle" }} />}
      {children}
    </button>
  );
}
