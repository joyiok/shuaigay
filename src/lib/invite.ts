/**
 * 邀请码:生成(撞唯一索引重试)与原子消耗(条件更新防并发超发)。
 * 纯数据逻辑抽出来,单测直接 mock db 覆盖。
 */
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

export const INVITE_CODES_PER_USER = 5;

/** 8 位十六进制邀请码 */
export function generateInviteCode(): string {
  return randomBytes(4).toString("hex");
}

/** 生成邀请码,撞唯一索引就换码重试,最多 5 次;成功返回 true */
export async function createInviteCode(userId: string): Promise<boolean> {
  for (let i = 0; i < 5; i++) {
    try {
      await db.invite.create({
        data: { code: generateInviteCode(), inviterId: userId },
      });
      return true;
    } catch {
      // 唯一冲突(极小概率),换一个码再试
    }
  }
  return false;
}

/**
 * 原子消耗邀请码:仅当 usedCount < maxUses 时条件更新 +1,
 * 两个并发注册同时消耗同一个码时最多只有一个成功,不会超发。
 * 返回邀请人 userId;码不存在或已被抢完返回 null。
 */
export async function consumeInvite(
  tx: Prisma.TransactionClient,
  code: string,
): Promise<string | null> {
  const invite = await tx.invite.findUnique({ where: { code } });
  if (!invite) return null;

  const consumed = await tx.invite.updateMany({
    where: { id: invite.id, usedCount: { lt: invite.maxUses } },
    data: { usedCount: { increment: 1 } },
  });
  return consumed.count === 0 ? null : invite.inviterId;
}