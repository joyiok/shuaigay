"use client";

import { useRef } from "react";
import MentionAutocomplete from "./MentionAutocomplete";
import { sendMessageAction } from "@/app/actions/messages";

export default function MessageComposer({
  receiverUsername,
}: {
  receiverUsername: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Enter 发送，Shift+Enter 换行；若 @ 提及面板展开则让 MentionAutocomplete 优先处理
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // MentionAutocomplete 展开时不要拦截，让其选中
      const mentionOpen = typeof document !== "undefined" && !!document.querySelector(".mention-pop");
      if (mentionOpen) return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      // 仅内容非空时提交
      const v = taRef.current?.value.trim();
      if (!v) return;
      formRef.current?.requestSubmit();
    }
  };

  return (
    <form
      ref={formRef}
      action={sendMessageAction}
      style={{ display: "grid", gap: 8, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}
    >
      <input type="hidden" name="receiverUsername" value={receiverUsername} />
      <div style={{ position: "relative" }}>
        <textarea
          ref={taRef}
          name="content"
          required
          rows={3}
          placeholder={`给 ${receiverUsername} 发私信… 支持 Markdown，@ 提及，回车发送 Shift+回车换行`}
          onKeyDown={onKeyDown}
          style={{
            width: "100%",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            outline: "none",
            lineHeight: 1.6,
            resize: "vertical",
            minHeight: 72,
          }}
        />
        <MentionAutocomplete textareaRef={taRef} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: "var(--text-subtle)", fontSize: 11, lineHeight: 1.5 }}>
          Enter 发送 · Shift+Enter 换行 · 输入 @ 触发提及
        </span>
        <button
          type="submit"
          style={{
            height: 32,
            padding: "0 16px",
            background: "var(--brand)",
            color: "#fff",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            border: "1px solid var(--brand)",
          }}
        >
          发送
        </button>
      </div>
    </form>
  );
}
