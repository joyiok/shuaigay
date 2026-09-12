/**
 * 积分统一入口：所有加减分必走这里，每笔同时写 User.points 与 PointTransaction。
 * - 事务内调用 applyPoints(tx, …)，独立调用 addPoints(…)（自带事务）
 * - 删除扣回 / 恢复补回走台账比对（award 次数 vs clawback 次数），删→恢复→删循环不重扣
 */
import { db } from "./db";

/** 流水原因（个人明细页文案见 POINT_REASON_LABEL） */
export const POINT_REASONS = [
  "thread_create",
  "thread_approve",
  "reply_create",
  "reply_approve",
  "invite_bonus",
  "checkin",
  "manual",
  "delete_clawback",
  "restore_grant",
  "opening_balance",
] as const;

export type PointReason = (typeof POINT_REASONS)[number];

export const POINT_REASON_LABEL: Record<string, string> = {
  thread_create: "发主题",
  thread_approve: "主题过审补发",
  reply_create: "回帖",
  reply_approve: "回帖过审补发",
  invite_bonus: "邀请奖励",
  checkin: "签到",
  manual: "管理员调整",
  delete_clawback: "内容删除扣回",
  restore_grant: "恢复补回",
  opening_balance: "期初结转",
};

export type PointRefType = "thread" | "post" | "user" | "checkin";

/** applyPoints 可接受的最小客户端：db 与事务 tx 都满足（结构类型，不绑 Prisma 泛型） */
type PointsWriter = {
  user: {
    update: (args: {
      where: { id: string };
      data: { points: { increment: number } };
      select: { points: true };
    }) => Promise<{ points: number }>;
  };
  pointTransaction: {
    create: (args: {
      data: {
        userId: string;
        delta: number;
        balance: number;
        reason: string;
        refType?: string | null;
        refId?: string | null;
      };
    }) => Promise<unknown>;
  };
};

/**
 * 台账内记一笔（调用方已有事务时用；原子性由外层事务保证）。
 * 返回变动后余额。
 */
export async function applyPoints(
  client: PointsWriter,
  userId: string,
  delta: number,
  reason: PointReason,
  ref?: { refType?: PointRefType | null; refId?: string | null },
): Promise<number> {
  const updated = await client.user.update({
    where: { id: userId },
    data: { points: { increment: delta } },
    select: { points: true },
  });
  await client.pointTransaction.create({
    data: {
      userId,
      delta,
      balance: updated.points,
      reason,
      refType: ref?.refType ?? null,
      refId: ref?.refId ?? null,
    },
  });
  return updated.points;
}

/** 独立加减分（自带事务，返回变动后余额） */
export async function addPoints(
  userId: string,
  delta: number,
  reason: PointReason,
  ref?: { refType?: PointRefType | null; refId?: string | null },
): Promise<number> {
  return db.$transaction((tx) => applyPoints(tx, userId, delta, reason, ref));
}

const AWARD_REASONS: Record<"thread" | "post", PointReason[]> = {
  thread: ["thread_create", "thread_approve", "restore_grant"],
  post: ["reply_create", "reply_approve", "restore_grant"],
};

async function countTx(userId: string, refType: string, refId: string, reason: PointReason | PointReason[]): Promise<number> {
  const reasonFilter = Array.isArray(reason) ? { in: reason } : reason;
  return db.pointTransaction.count({ where: { userId, refType, refId, reason: reasonFilter } });
}

/**
 * 删除扣回：该 ref 曾经加过分、且扣回次数还没追上加分次数时，扣 amount。
 * pending 内容从未加分 → 直接跳过；删→恢复→删循环 → 每次有效删除只扣一次。
 */
export async function clawbackIfAwarded(
  userId: string,
  refType: "thread" | "post",
  refId: string,
  amount: number,
): Promise<boolean> {
  if (!amount) return false;
  let awards = 0;
  let claws = 0;
  try {
    awards = await countTx(userId, refType, refId, AWARD_REASONS[refType]);
    claws = await countTx(userId, refType, refId, "delete_clawback");
  } catch {
    return false;
  }
  if (awards === 0 || claws >= awards) return false;
  await addPoints(userId, -amount, "delete_clawback", { refType, refId }).catch(() => {});
  return true;
}

/**
 * 恢复补回：undo 最近一次有效扣回。pending 删→恢复（从未加分）不补，保持现状。
 */
export async function regrantIfClawed(
  userId: string,
  refType: "thread" | "post",
  refId: string,
  amount: number,
): Promise<boolean> {
  if (!amount) return false;
  let claws = 0;
  let regrants = 0;
  try {
    claws = await countTx(userId, refType, refId, "delete_clawback");
    regrants = await countTx(userId, refType, refId, "restore_grant");
  } catch {
    return false;
  }
  if (claws === 0 || regrants >= claws) return false;
  await addPoints(userId, amount, "restore_grant", { refType, refId }).catch(() => {});
  return true;
}
