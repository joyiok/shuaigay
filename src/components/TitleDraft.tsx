"use client";

import { useEffect } from "react";
import { clearDraft, getLocalStorage, loadDraft, saveDraft } from "@/lib/draft";

/**
 * 新帖标题草稿:发帖页标题是普通 input(不在 Composer 里),
 * 由该组件负责恢复/自动保存/提交清除。挂载在同一个 form 内即可。
 */
export default function TitleDraft({ storageKey }: { storageKey: string }) {
  useEffect(() => {
    const store = getLocalStorage();
    const input = document.querySelector('input[name="title"]') as HTMLInputElement | null;
    if (!input) return;
    const saved = loadDraft(store, storageKey);
    if (saved && !input.value) {
      input.value = saved;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => saveDraft(store, storageKey, input.value), 500);
    };
    const form = input.form;
    const onSubmit = () => clearDraft(store, storageKey);
    // Composer 的「清除草稿」联动:标题一起清
    const onClearAll = () => {
      clearDraft(store, storageKey);
      input.value = "";
    };
    input.addEventListener("input", onInput);
    form?.addEventListener("submit", onSubmit);
    window.addEventListener("sg:clear-drafts", onClearAll);
    return () => {
      clearTimeout(timer);
      input.removeEventListener("input", onInput);
      form?.removeEventListener("submit", onSubmit);
      window.removeEventListener("sg:clear-drafts", onClearAll);
    };
  }, [storageKey]);
  return null;
}
