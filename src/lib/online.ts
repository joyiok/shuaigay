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
