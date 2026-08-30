"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";

export interface EditItem {
  id: string;
  editorName: string;
  oldContentMd: string;
  newContentMd: string;
  createdAt: string;
}

/** 楼层下的「已编辑」标记:点击展开编辑历史(简单列表,旧/新内容对照) */
export default function EditHistory({ edits }: { edits: EditItem[] }) {
  const [open, setOpen] = useState(false);
  if (edits.length === 0) return null;

  const count = edits.length;

  return (
    <div style={{ fontSize: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="查看编辑历史"
        style={{
          border: "none",
          background: "var(--line-soft)",
          color: "var(--text-muted)",
          borderRadius: 999,
          padding: "2px 10px",
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        {open ? "收起历史" : `已编辑${count > 1 ? ` ${count} 次` : ""}`}
      </button>

      {open && (
        <ul
          style={{
            listStyle: "none",
            margin: "8px 0 0",
            padding: 0,
            display: "grid",
            gap: 8,
          }}
        >
          {edits.map((e, i) => (
            <li
              key={e.id}
              style={{
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
                padding: "8px 10px",
                display: "grid",
                gap: 6,
                background: "var(--bg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 700 }}>
                  {i === 0 ? "最近一次编辑" : `第 ${count - i} 次编辑`}
                </span>
                <span style={{ color: "var(--text-subtle)" }}>
                  @{e.editorName} · {formatDate(new Date(e.createdAt))}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--text-subtle)", marginBottom: 2 }}>
                    旧内容
                  </div>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      lineHeight: 1.6,
                      maxHeight: 96,
                      overflowY: "auto",
                      border: "1px solid var(--line-soft)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      background: "var(--panel)",
                    }}
                  >
                    {e.oldContentMd || "(空)"}
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--text-subtle)", marginBottom: 2 }}>
                    新内容
                  </div>
                  <div
                    style={{
                      color: "var(--text)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      lineHeight: 1.6,
                      maxHeight: 96,
                      overflowY: "auto",
                      border: "1px solid var(--line-soft)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      background: "var(--panel)",
                    }}
                  >
                    {e.newContentMd || "(空)"}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}