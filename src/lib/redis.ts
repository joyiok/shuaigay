import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis | null };

/**
 * 返回 Redis 客户端;未配置 REDIS_URL 时返回 null。
 * 所有调用方都必须处理 null 并降级,Redis 挂掉不能影响主功能。
 */
export function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (globalForRedis.redis !== undefined) return globalForRedis.redis;

  const redis = new Redis(process.env.REDIS_URL, {
    // lazyConnect=true 时必须手动 connect()，否则首个命令会因
    // enableOfflineQueue=false 直接抛 Stream isn't writeable。改用自动连接。
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 1000, 10_000),
  });
  // 防止 error 事件无人监听导致进程崩溃,降级逻辑在各调用方里做
  redis.on("error", () => {});
  globalForRedis.redis = redis;
  return redis;
}
