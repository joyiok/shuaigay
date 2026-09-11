import { NextResponse } from "next/server";
import { recordError, recordVital } from "@/lib/observability";
import { checkRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 前端埋点收集：404/500 与 Web Vitals。
 * 公开端点，按 IP 限流；只接受固定形状的小载荷，写入按天聚合表。
 */
export async function POST(req: Request): Promise<Response> {
  // 与 lib/ratelimit:clientIp 一致取 XFF 末段：Caddy 已把真实 IP 改写为单值，首段不可信
  const xff = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const ip = req.headers.get("cf-connecting-ip")?.trim() || (xff.length ? xff[xff.length - 1]! : "unknown");
  if (!(await checkRateLimit(`collect:${ip}`, 60, 60))) {
    return new NextResponse(null, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  let body: { type?: string; kind?: string; path?: string; metric?: string; value?: number } | null = null;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!body || typeof body !== "object") return new NextResponse(null, { status: 400 });

  const ua = req.headers.get("user-agent");
  const referrer = req.headers.get("referer");

  if (body.type === "error") {
    const kind = body.kind === "500" ? "500" : "404";
    const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path : "/";
    await recordError({ kind, path, referrer, ua });
  } else if (body.type === "vitals") {
    const metric = typeof body.metric === "string" ? body.metric : "";
    const value = Number(body.value);
    if (metric) await recordVital({ metric, value, path: body.path, ua });
  } else {
    return new NextResponse(null, { status: 400 });
  }

  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
