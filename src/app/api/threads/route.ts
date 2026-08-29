import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listThreads, searchPosts, searchThreads } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";

/**
 * 无限滚动数据接口(纯 JSON,给 InfiniteList 用):
 * GET /api/threads?board=<slug>&cursor=<c>     版块主题列表下一页
 * GET /api/threads?q=<词>&board=<slug>&type=thread|post&cursor=<c>  搜索结果下一页
 *
 * 与页面共用同一套游标查询,保证和 SSR 首屏排序一致。
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const boardSlug = sp.get("board")?.trim();
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const type = sp.get("type") === "post" ? "post" : "thread";
  const cursor = decodeCursor(sp.get("cursor"));

  let items: unknown[] = [];
  let nextCursor: string | null = null;

  if (q) {
    // 搜索:版块过滤是可选的,slug 无效时当作全站搜索
    const board = boardSlug
      ? await db.board.findUnique({ where: { slug: boardSlug } })
      : null;
    if (type === "post") {
      const r = await searchPosts(q, board?.id, cursor);
      items = r.items;
      nextCursor = r.nextCursor;
    } else {
      const r = await searchThreads(q, board?.id, cursor);
      items = r.items;
      nextCursor = r.nextCursor;
    }
  } else if (boardSlug) {
    const board = await db.board.findUnique({ where: { slug: boardSlug } });
    if (!board) {
      return NextResponse.json({ error: "版块不存在" }, { status: 404 });
    }
    const r = await listThreads(board.id, cursor);
    items = r.items;
    nextCursor = r.nextCursor;
  } else {
    return NextResponse.json(
      { error: "缺少 board 或 q 参数" },
      { status: 400 },
    );
  }

  // Date 统一序列化成 ISO 字符串,客户端直接 new Date() 还原
  const payload = JSON.parse(JSON.stringify({ items, nextCursor })) as {
    items: unknown[];
    nextCursor: string | null;
  };
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}