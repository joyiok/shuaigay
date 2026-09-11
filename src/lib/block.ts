/**
 * 屏蔽/拉黑：屏蔽后互不可见回帖、私信，也不再产生对方的通知。
 * 查询走 Redis 缓存（60s），避免每次列表页都查一次库。
 */
import { db } from "./db";
import { getRedis } from "./redis";

const CACHE_TTL = 60;

/** 我屏蔽了谁 */
export async function getBlockedIds(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  const redis = getRedis();
  const key = `block:${userId}`;
  if (redis) {
    const cached = await redis.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as string[];
  }
  const rows = await db.block.findMany({ where: { userId }, select: { targetId: true } }).catch(() => []);
  const ids = rows.map((r) => r.targetId);
  if (redis) await redis.set(key, JSON.stringify(ids), "EX", CACHE_TTL).catch(() => {});
  return ids;
}

export async function getBlockedIdSet(userId: string | null | undefined): Promise<Set<string>> {
  return new Set(await getBlockedIds(userId));
}

async function clearCache(userId: string): Promise<void> {
  const redis = getRedis();
  if (redis) await redis.del(`block:${userId}`).catch(() => {});
}

export async function blockUser(userId: string, targetId: string): Promise<void> {
  if (userId === targetId) return;
  await db.block.create({ data: { userId, targetId } }).catch(() => {});
  await clearCache(userId);
}

export async function unblockUser(userId: string, targetId: string): Promise<void> {
  await db.block.deleteMany({ where: { userId, targetId } }).catch(() => {});
  await clearCache(userId);
}

/** 互查：任一方屏蔽即视为阻断（私信用） */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const row = await db.block
    .findFirst({
      where: { OR: [{ userId: a, targetId: b }, { userId: b, targetId: a }] },
      select: { id: true },
    })
    .catch(() => null);
  return !!row;
}

/** 谁屏蔽了我（用于「不要给屏蔽我的人发通知」） */
export async function blockersOf(userId: string, candidates: string[]): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const rows = await db.block
    .findMany({ where: { targetId: userId, userId: { in: candidates } }, select: { userId: true } })
    .catch(() => []);
  return new Set(rows.map((r) => r.userId));
}

export async function listBlocked(userId: string) {
  return db.block
    .findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, createdAt: true, target: { select: { id: true, username: true, avatarUrl: true } } },
    })
    .catch(() => []);
}
