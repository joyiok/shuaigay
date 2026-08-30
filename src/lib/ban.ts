/**
 * 封禁逻辑:判断用户是否被封,提供封禁/解封原子操作。
 */
import { redirect } from "next/navigation";
import { db } from "./db";
import { logger } from "./logger";

export async function isUserBanned(userId: string): Promise<{ banned: boolean; ban?: { id: string; reason: string; expiresAt: Date | null } }> {
  const ban = await db.ban.findFirst({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!ban) return { banned: false };
  return { banned: true, ban };
}

export async function banUser(
  userId: string,
  reason: string,
  durationHours?: number | null,
): Promise<void> {
  const trimmed = reason.trim().slice(0, 200) || "违反社区规定";
  const expiresAt = durationHours ? new Date(Date.now() + durationHours * 3_600_000) : null;
  await db.ban.create({ data: { userId, reason: trimmed, expiresAt } });
  logger.info("ban.create", { userId, reason: trimmed, expiresAt: expiresAt?.toISOString() ?? "permanent" });
}

export async function unbanUser(userId: string): Promise<number> {
  const res = await db.ban.updateMany({
    where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    data: { expiresAt: new Date() },
  });
  if (res.count > 0) logger.info("ban.lifted", { userId, count: res.count });
  return res.count;
}

/** server action 守卫:已登录但被封的用户,发帖/回帖/私信等写操作一律拦回登录页 */
export async function assertNotBanned(userId: string): Promise<void> {
  const { banned } = await isUserBanned(userId);
  if (banned) {
    logger.warn("ban.blocked_action", { userId });
    redirect("/login?error=banned");
  }
}

export async function listActiveBans(userIds: string[]): Promise<Map<string, { id: string; reason: string; expiresAt: Date | null }>> {
  if (userIds.length === 0) return new Map();
  const bans = await db.ban.findMany({
    where: { userId: { in: userIds }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
  });
  const map = new Map<string, { id: string; reason: string; expiresAt: Date | null }>();
  for (const b of bans) {
    if (!map.has(b.userId)) map.set(b.userId, b);
  }
  return map;
}
