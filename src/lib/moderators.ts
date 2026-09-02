/**
 * 版主权限(DB 侧)。与 permissions.ts 纯函数分工:
 * 这里只回答「谁管哪些版块」,页面/action 拿到结果后再用纯函数判定。
 */
import { cache } from "react";
import { db } from "./db";

/** 某用户管辖的版块 id 集合(请求内缓存,页面多次判定只查一次) */
export const getModeratedBoardIds = cache(async (userId: string): Promise<Set<string>> => {
  const rows = await db.boardModerator.findMany({
    where: { userId },
    select: { boardId: true },
  });
  return new Set(rows.map((r) => r.boardId));
});

export async function isBoardModerator(userId: string, boardId: string): Promise<boolean> {
  const set = await getModeratedBoardIds(userId);
  return set.has(boardId);
}

/** 版块下的版主(展示用) */
export async function listBoardModerators(boardId: string) {
  return db.boardModerator.findMany({
    where: { boardId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, username: true } } },
  });
}
