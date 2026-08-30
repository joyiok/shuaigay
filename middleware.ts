import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 请求链路中间件：为每个请求注入 x-request-id，便于 logger 串联
 * 若上游 (Caddy/客户端) 已带 x-request-id 则透传，否则生成 8 位短 id
 * 响应头同步回传，便于前端/监控关联
 */
export function middleware(req: NextRequest) {
  const incoming = req.headers.get("x-request-id");
  const requestId =
    incoming && /^[a-zA-Z0-9-_]{4,64}$/.test(incoming)
      ? incoming
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: "/:path*",
};
