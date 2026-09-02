import { db } from "./db";
import { containsSensitive } from "./sensitive";

export interface ApprovalUser {
  id: string;
  points: number;
  createdAt: Date;
}

export interface ApprovalBoard {
  id: string;
  requireApproval: boolean;
}

/**
 * 判断是否需要进入待审（A/B/C 全量）
 * A: 新人见习 — 积分 <30 或 注册 24h 内
 * B: 版块开关 — board.requireApproval
 * C: 敏感词 — 命中则待审（不再直接拦截）
 */
export async function needsApproval(
  user: ApprovalUser,
  board: ApprovalBoard,
  title: string,
  content: string,
  isStaff = false,
): Promise<{ pending: boolean; reason: string | null }> {
  if (!isStaff && board.requireApproval) return { pending: true, reason: "版块开启审核" };
  // 等级不足发外链需审核
  const { hasLink } = await import("./levels");
  if (!isStaff && hasLink(title + " " + content) && user.points < 30) return { pending: true, reason: "等级不足，发外链需正式会员" };
  if (user.points < 30) return { pending: true, reason: "新人见习" };
  const ageMs = Date.now() - new Date(user.createdAt).getTime();
  if (ageMs < 24 * 60 * 60 * 1000) return { pending: true, reason: "注册24h内" };
  if ((await containsSensitive(title)) || (await containsSensitive(content))) {
    return { pending: true, reason: "命中敏感词" };
  }
  return { pending: false, reason: null };
}

export async function fetchApprovalUser(userId: string): Promise<ApprovalUser | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, points: true, createdAt: true } });
  return u as ApprovalUser | null;
}

export async function fetchApprovalBoard(boardId: string): Promise<ApprovalBoard | null> {
  const b = await db.board.findUnique({ where: { id: boardId }, select: { id: true, requireApproval: true } });
  return b as ApprovalBoard | null;
}
