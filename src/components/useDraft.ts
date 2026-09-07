"use client";

import { useEffect, useState } from "react";
import { getLocalStorage, loadDraft, saveDraft } from "@/lib/draft";

export function useDraft(key?: string) {
  const [text, setText] = useState("");
  useEffect(() => { setText(key ? loadDraft(getLocalStorage(), key) : ""); }, [key]);
  // 即时保存，快速刷新、跳转或提交失败都不会丢掉最后一次输入。
  return [text, (value: string) => {
    if (key) saveDraft(getLocalStorage(), key, value);
    setText(value);
  }] as const;
}
