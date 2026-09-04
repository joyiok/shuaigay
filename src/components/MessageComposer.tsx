"use client";

import { useEffect, useRef, useState } from "react";
import MentionAutocomplete from "./MentionAutocomplete";
import { sendMessageAction } from "@/app/actions/messages";
import { clearDraft, draftKey, getLocalStorage, loadDraft, saveDraft } from "@/lib/draft";

export default function MessageComposer({
  receiverUsername,
}: {
  receiverUsername: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const key = draftKey("msg", receiverUsername);
  const [text, setText] = useState("");

  // 草稿恢复:挂载后读(避开 SSR 水合 mismatch)
  useEffect(() => {
    const saved = loadDraft(getLocalStorage(), key);
    if (saved) setText(saved);
  }, [key]);

  // 自动保存 + 提交清除
  useEffect(() => {
    const id = setTimeout(() => saveDraft(getLocalStorage(), key, text), 500);
    return () => clearTimeout(id);
  }, [text, key]);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onSubmit = () => {
      clearDraft(getLocalStorage(), key);
      setText("");
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [key]);

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
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="composer-textarea"
          style={{ minHeight: 72 }}
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
