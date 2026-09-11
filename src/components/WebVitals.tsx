"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * 真实用户体验指标上报（LCP/INP/CLS/TTFB/FCP）。
 * 用 sendBeacon 异步发，不阻塞渲染；后台按天聚合，页面里只看「平均 + 良好率」。
 */
export default function WebVitals({ path }: { path: string }) {
  useReportWebVitals((metric) => {
    const payload = JSON.stringify({ type: "vitals", metric: metric.name, value: metric.value, path });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/collect", new Blob([payload], { type: "application/json" }));
        return;
      }
    } catch {
      /* 降级到 fetch */
    }
    void fetch("/api/collect", { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  });

  return null;
}
