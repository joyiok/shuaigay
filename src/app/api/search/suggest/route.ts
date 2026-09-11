import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";

function requestIp(req: NextRequest): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const parts =
    req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return parts.length ? parts[parts.length - 1]! : "unknown";
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  if (!raw) {
    return NextResponse.json(
      { suggestions: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  // 联想接口是全站高频匿名入口，按 IP 限流防 %q% 全表扫打爆 DB
  if (!(await checkRateLimit(`suggest:${requestIp(req)}`, 60, 60))) {
    return NextResponse.json(
      { suggestions: [] },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    // 只建议已过审、非隐藏版块的标题：待审/隐藏内容不可被匿名枚举
    const rows = await db.thread.findMany({
      where: {
        title: { contains: raw, mode: "insensitive" },
        status: "approved",
        board: { isHidden: false },
      },
      orderBy: { lastPostAt: "desc" },
      take: 5,
      select: { id: true, title: true },
    });
    return NextResponse.json(
      { suggestions: rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { suggestions: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
