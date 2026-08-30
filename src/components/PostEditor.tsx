"use client";

import { useState } from "react";
import { editPostAction } from "@/app/actions/threads";

/**
 * 楼层「编辑」:点按钮展开内联表单(只改 Markdown 原文,附件不动)。
 * 表单是原生 server action 提交,提交后整页刷新;取消只是收起表单。
 * 放在楼层的操作行里,展开时通过 flex-basis:100% 换行占满整行。
 */
export default function PostEditor({
  postId,
  contentMd,
}: {
  postId: string;
  contentMd: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="post-quote-btn"
        onClick={() => setOpen(true)}
      >
        编辑
      </button>
    );
  }

  return (
    <form
      action={editPostAction}
      style={{
        flex: "1 0 100%",
        display: "grid",
        gap: 8,
        padding: "10px 12px",
        border: "1px dashed var(--line)",
        borderRadius: 10,
        background: "var(--bg)",
        marginTop: 2,
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <textarea
        name="content"
        required
        rows={7}
        defaultValue={contentMd}
        aria-label="编辑内容"
        style={{
          width: "100%",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "10px 12px",
          fontSize: 13,
          outline: "none",
          lineHeight: 1.6,
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            height: 30,
            padding: "0 14px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            background: "var(--panel)",
            fontSize: 12,
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          取消
        </button>
        <button
          type="submit"
          style={{
            height: 30,
            padding: "0 14px",
            background: "var(--brand)",
            color: "#fff",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            border: "1px solid var(--brand)",
            cursor: "pointer",
          }}
        >
          保存修改
        </button>
      </div>
    </form>
  );
}