"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useFormStatus } from "react-dom";

/** 站点密钥由构建时注入;未配置时不渲染任何内容,表单照常可用 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

interface TurnstileWidget {
  render(el: HTMLElement, opts: TurnstileRenderOptions): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  theme?: "light" | "dark" | "auto";
  "response-field"?: boolean;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget;
  }
}

const WIDGET_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Turnstile 人机验证(显式渲染):
 * - 异步加载官方脚本,加载完成后把 widget 渲染进容器
 * - 拿到 token 后写入隐藏 input `cf-turnstile-response`,随表单提交
 * - token 过期自动重置;resetSignal 变化时重置(配合服务端 captcha_failed 重试)
 */
export default function Turnstile({
  action,
  resetSignal,
}: {
  action: string;
  resetSignal?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const { pending } = useFormStatus();

  useEffect(() => {
    const el = containerRef.current;
    const ts = window.turnstile;
    if (!SITE_KEY || !el || !ts) return;
    widgetIdRef.current = ts.render(el, {
        sitekey: SITE_KEY,
        action,
        theme: "light",
        "response-field": false,
        callback: (t: string) => { setToken(t); setError(false); },
        "expired-callback": () => {
          setToken("");
          ts.reset(widgetIdRef.current ?? undefined);
        },
        "error-callback": () => { setToken(""); setError(true); },
    });

    return () => {
      const id = widgetIdRef.current;
      if (id) window.turnstile?.remove(id);
      widgetIdRef.current = null;
    };
  }, [action, ready]);

  // 服务端返回 captcha_failed(跳回本页)时,重置 widget 让用户重新验证
  useEffect(() => {
    if (pending || !widgetIdRef.current || !window.turnstile) return;
    setToken("");
    window.turnstile.reset(widgetIdRef.current);
  }, [resetSignal, pending]);

  if (!SITE_KEY) return null;

  return (
    <div
      className="turnstile-wrap"
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <Script src={WIDGET_SRC} onReady={() => setReady(true)} onError={() => setError(true)} />
      <div ref={containerRef} aria-label="人机验证" />
      <input type="hidden" name="cf-turnstile-response" value={token} />
      {error && <p role="alert">人机验证加载失败，请检查网络并刷新页面重试。</p>}
    </div>
  );
}
