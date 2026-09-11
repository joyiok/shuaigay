"use client";

import { useEffect } from "react";

/**
 * 404 / 500 上报：页面一渲染就打点（爬虫在服务端被过滤掉）。
 * 只报路径与类型，不采集用户信息。
 */
export default function ErrorBeacon({ kind }: { kind: "404" | "500" }) {
  useEffect(() => {
    const path = window.location.pathname + window.location.search;
    const payload = JSON.stringify({ type: "error", kind, path });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/collect", new Blob([payload], { type: "application/json" }));
        return;
      }
    } catch {
      /* 降级 */
    }
    void fetch("/api/collect", { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  }, [kind]);

  return null;
}
