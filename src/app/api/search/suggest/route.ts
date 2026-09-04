import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  if (!raw) {
    return NextResponse.json(
      { suggestions: [] },
      { headers: { "Cache-Control": "no-store" } },
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
