"use client";

import { useEffect } from "react";

/** PWA Service Worker 注册：失败静默（隐私模式/HTTP/2 下不影响主流程） */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // 仅生产启用，避免 dev 下缓存干扰 HMR
    if (process.env.NODE_ENV !== "production") return;
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {}
    };
    // 空闲时再注册，不阻塞首屏
    if ("requestIdleCallback" in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(register);
    } else {
      setTimeout(register, 3000);
    }
  }, []);
  return null;
}
