import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * 通知接口:
 *   GET  /api/notifications?limit=20&unread=1  -> { unread, items }
 *   POST /api/notifications { id?: string }    -> 标记 1 条/全部已读
 * 只允许本人读写自己的通知;id 无效时静默忽略。
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit)
    ? Math.min(50, Math.max(1, Math.trunc(rawLimit)))
    : 20;
  const onlyUnreadCount = url.searchParams.get("unread") === "1";

  const [items, unread] = await Promise.all([
    onlyUnreadCount
      ? []
      : db.notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: limit,
        }),
    db.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  return NextResponse.json({
    unread,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" && body.id ? body.id : null;

  if (id) {
    await db.notification.updateMany({
      where: { id, userId: user.id },
      data: { read: true },
    });
  } else {
    await db.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
  }

  const unread = await db.notification.count({
    where: { userId: user.id, read: false },
  });
  return NextResponse.json({ ok: true, unread });
}