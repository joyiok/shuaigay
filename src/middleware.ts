import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 请求链路中间件：为每个请求注入 x-request-id，便于 logger 串联
 * 若上游 (Caddy/客户端) 已带 x-request-id 则透传，否则生成 8 位短 id
 * 响应头同步回传，便于前端/监控关联
 *
 * 另负责游客试读计数 cookie（sg_gv）：Server Component 里只允许读 cookie，
 * 写必须在这里。游客访问主题页时滚动计数（同一主题 5 分钟内不重复计），
 * 响应带 Set-Cookie 的请求 Cloudflare 默认不缓存 + Caddy 显式排除，
 * 保证计数与拦截状态不污染边缘缓存。
 * 注意：本文件禁止 import 任何 lib（含 db/redis），保持 middleware 轻量。
 */
const GUEST_COOKIE = "sg_gv";
const GUEST_REPEAT_WINDOW_SEC = 300;
const BOT_RE = /(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|python-requests|curl|wget|headless|monitor|uptime)/i;

function guestDay(): string {
  return new Date(Date.now() + 8 * 60 * 60_000).toISOString().slice(0, 10);
}

function bumpGuestCookie(raw: string | undefined, threadId: string, today: string, nowSec: number): string | null {
  let count = 0;
  let lastId = "";
  let lastTs = 0;
  if (raw) {
    const parts = raw.split(".");
    if (parts.length === 4 && parts[0] === today) {
      const c = Number(parts[1]);
      const t = Number(parts[3]);
      if (Number.isFinite(c) && c >= 0 && Number.isFinite(t) && t >= 0) {
        count = Math.floor(c);
        lastId = parts[2] ?? "";
        lastTs = Math.floor(t);
      }
    }
  }
  const freshRepeat = lastId === threadId && lastTs > 0 && nowSec - lastTs < GUEST_REPEAT_WINDOW_SEC;
  if (!freshRepeat) count += 1;
  // 线性增长封顶，避免 cookie 被刷爆（Redis 主计数不受影响）
  if (count > 99999) count = 99999;
  return `${today}.${count}.${threadId}.${nowSec}`;
}

export function middleware(req: NextRequest) {
  const incoming = req.headers.get("x-request-id");
  const requestId =
    incoming && /^[a-zA-Z0-9-_]{4,64}$/.test(incoming)
      ? incoming
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  // 供服务端统计使用：路径 + 是否文档请求（RSC/预取不计入 PV）
  requestHeaders.set("x-pathname", req.nextUrl.pathname + req.nextUrl.search);
  const isDoc =
    req.method === "GET" &&
    !req.headers.get("rsc") &&
    !req.headers.get("next-router-prefetch") &&
    (req.headers.get("accept") ?? "").includes("text/html");
  if (isDoc) requestHeaders.set("x-doc", "1");

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });
  res.headers.set("x-request-id", requestId);

  // 游客主题阅读：在响应上滚动 sg_gv 计数（登录态/爬虫/非主题页跳过）
  const pathname = req.nextUrl.pathname;
  if (req.method === "GET" && (pathname === "/t" || pathname.startsWith("/t/"))) {
    const hasSession = req.cookies.has("session");
    const ua = req.headers.get("user-agent") ?? "";
    if (!hasSession && ua && !BOT_RE.test(ua)) {
      const seg = pathname.split("/")[2] ?? "";
      const threadId = seg.split("-")[0] ?? "";
      if (threadId) {
        const today = guestDay();
        const bumped = bumpGuestCookie(req.cookies.get(GUEST_COOKIE)?.value, threadId, today, Math.floor(Date.now() / 1000));
        if (bumped) {
          res.cookies.set(GUEST_COOKIE, bumped, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 86400,
            secure: process.env.NODE_ENV === "production",
          });
        }
      }
    }
  }
  return res;
}

export const config = {
  matcher: "/:path*",
};
