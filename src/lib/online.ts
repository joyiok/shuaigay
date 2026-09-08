import { headers } from "next/headers";
import { getRedis } from "./redis";

const WINDOW_SEC = 300;

/**
 * 记录在线状态并返回 5 分钟内活跃数。
 * 登录用户按 userId 记,匿名按 IP 记;Redis 不可用时返回 null(页面隐藏该数字)。
 */
export async function trackAndCountOnline(userId?: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const id = userId ?? (await clientIp());
    const now = Date.now();
    await redis.zadd("online", now, id);
    await redis.zremrangebyscore("online", 0, now - WINDOW_SEC * 1000);
    return await redis.zcard("online");
  } catch {
    return null;
  }
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
}

/**
 * 取当前在线 id 集合(5 分钟窗口)。
 * 集合里混有匿名访客的 IP 与登录用户的 userId,调用方查库时用
 * `id: { in: [...] }` 天然过滤掉 IP,不要直接当用户名展示。
 * Redis 不可用时返回 null(页面隐藏在线标记)。
 */
export async function getOnlineIds(): Promise<Set<string> | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const now = Date.now();
    await redis.zremrangebyscore("online", 0, now - WINDOW_SEC * 1000);
    const ids = await redis.zrangebyscore("online", now - WINDOW_SEC * 1000, "+inf");
    return new Set(ids);
  } catch {
    return null;
  }
}
