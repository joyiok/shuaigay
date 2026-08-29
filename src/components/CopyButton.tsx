"use client";

import { useState } from "react";

/** 复制到剪贴板的小按钮,点击后短暂显示「已复制」 */
export default function CopyButton({
  text,
  label = "复制",
  copiedLabel = "已复制",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      style={{
        height: 26,
        padding: "0 10px",
        borderRadius: 6,
        border: "1px solid var(--line)",
        background: copied ? "var(--success-soft)" : "var(--panel)",
        color: copied ? "var(--success)" : "var(--text-muted)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}