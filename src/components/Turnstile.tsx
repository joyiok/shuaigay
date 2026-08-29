"use client";

import { useEffect, useRef, useState } from "react";

/** 站点密钥由构建时注入;未配置时不渲染任何内容,表单照常可用 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

interface TurnstileWidget {
  render(el: HTMLElement, opts: TurnstileRenderOptions): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

interface TurnstileRenderOptions {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget;
    __shuaigayTurnstileReady?: () => void;
  }
}

const WIDGET_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__shuaigayTurnstileReady";

/**
 * Turnstile 人机验证(显式渲染):
 * - 异步加载官方脚本,加载完成后把 widget 渲染进容器
 * - 拿到 token 后写入隐藏 input `cf-turnstile-response`,随表单提交
 * - token 过期自动重置;resetSignal 变化时重置(配合服务端 captcha_failed 重试)
 */
export default function Turnstile({
  resetSignal,
}: {
  resetSignal?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    let rendered = false;

    const render = () => {
      const el = containerRef.current;
      const ts = window.turnstile;
      if (!el || !ts || rendered || cancelled) return;
      rendered = true;
      widgetIdRef.current = ts.render(el, {
        sitekey: SITE_KEY,
        theme: "light",
        callback: (t: string) => setToken(t),
        "expired-callback": () => {
          setToken("");
          ts.reset(widgetIdRef.current ?? undefined);
        },
        "error-callback": () => setToken(""),
      });
    };

    if (window.turnstile) {
      render();
      return;
    }

    // 先挂全局回调,再插脚本;脚本异步执行时会回调渲染
    window.__shuaigayTurnstileReady = render;
    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      if (id) window.turnstile?.remove(id);
      widgetIdRef.current = null;
      window.__shuaigayTurnstileReady = undefined;
    };
  }, []);

  // 服务端返回 captcha_failed(跳回本页)时,重置 widget 让用户重新验证
  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.turnstile) return;
    setToken("");
    window.turnstile.reset(widgetIdRef.current);
  }, [resetSignal]);

  if (!SITE_KEY) return null;

  return (
    <div
      className="turnstile-wrap"
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div ref={containerRef} aria-label="人机验证" />
      <input type="hidden" name="cf-turnstile-response" value={token} />
    </div>
  );
}