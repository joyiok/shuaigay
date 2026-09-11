import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { listThreads, searchPosts, searchThreads } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";
import { checkRateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";

/**
 * 无限滚动数据接口(纯 JSON,给 InfiniteList 用):
 * GET /api/threads?board=<slug>&cursor=<c>     版块主题列表下一页
 * GET /api/threads?q=<词>&board=<slug>&type=thread|post&cursor=<c>  搜索结果下一页
 *
 * 与页面共用同一套游标查询,保证和 SSR 首屏排序一致。
 * 可见性与页面保持一致：隐藏版块仅版主/管理员可见；待审仅作者本人与 staff 可见。
 */
function requestIp(req: NextRequest): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const parts =
    req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return parts.length ? parts[parts.length - 1]! : "unknown";
}

export async function GET(req: NextRequest) {
  const ip = requestIp(req);
  if (!(await checkRateLimit(`threads-api:${ip}`, 60, 60))) {
    return NextResponse.json({ error: "请求太频繁" }, { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const boardSlug = sp.get("board")?.trim();
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const type = sp.get("type") === "post" ? "post" : "thread";
  const cursor = decodeCursor(sp.get("cursor"));

  const rawCat = sp.get("cat")?.trim() ?? "";
  let items: unknown[] = [];
  let nextCursor: string | null = null;

  const viewer = await getCurrentUser().catch(() => null);
  const isAdmin = viewer?.role === "ADMIN";
  const isStaffOf = async (boardId: string): Promise<boolean> => {
    if (!viewer) return false;
    if (isAdmin) return true;
    // 路由处理器内直查，避免 react cache 跨请求复用
    const row = await db.boardModerator.findUnique({
      where: { boardId_userId: { boardId, userId: viewer.id } },
      select: { id: true },
    }).catch(() => null);
    return !!row;
  };

  if (q) {
    // 搜索:版块过滤是可选的,slug 无效时当作全站搜索（全站搜索只含非隐藏版块，见 queries）
    const board = boardSlug
      ? await db.board.findUnique({ where: { slug: boardSlug }, select: { id: true, isHidden: true } })
      : null;
    if (board) {
      // 指定了隐藏版块：仅 staff 可搜，否则按不存在处理，避免暴露隐藏版块存在性
      const staff = await isStaffOf(board.id);
      if (board.isHidden && !staff) {
        return NextResponse.json({ items: [], nextCursor: null }, { headers: { "Cache-Control": "no-store" } });
      }
    }
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
    const board = await db.board.findUnique({ where: { slug: boardSlug }, select: { id: true, isHidden: true } });
    if (!board) {
      return NextResponse.json({ error: "版块不存在" }, { status: 404 });
    }
    const staff = await isStaffOf(board.id);
    if (board.isHidden && !staff) {
      return NextResponse.json({ error: "版块不存在" }, { status: 404 });
    }
    let categoryId: string | null = null;
    if (rawCat) {
      const cat = await db.threadCategory.findFirst({ where: { id: rawCat, boardId: board.id }, select: { id: true } });
      categoryId = cat?.id ?? null;
    }
    // 透传登录态：与页面一致，staff 可见待审/已删外内容，普通用户可见自己的待审
    const r = await listThreads(board.id, cursor, categoryId, viewer?.id ?? null, staff);
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
  logger.info("api.threads.list", { board: boardSlug ?? "all", q: q ? q.slice(0, 20) : "", items: (payload.items as unknown[]).length });
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
