import { getRedis } from "./redis";

/**
 * Redis 挂掉时的内存兜底（仅本进程/单机有效，多副本下会宽松，但比完全放行安全）。
 * 登录/注册等敏感限流在 Redis 不可用时仍受约束；普通限流同样适用。
 * Map 定期清理过期桶，避免无限增长。
 */
const memBuckets = new Map<string, { count: number; expiresAt: number }>();
let lastSweep = 0;

function memCheck(key: string, limit: number, windowSec: number): boolean {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, v] of memBuckets) if (v.expiresAt <= now) memBuckets.delete(k);
    // 防止异常增长：超过 20k 桶直接清空（限流变宽松一次，可接受）
    if (memBuckets.size > 20_000) memBuckets.clear();
  }
  const bucket = Math.floor(now / (windowSec * 1000));
  const k = `mem:${key}:${windowSec}:${bucket}`;
  const cur = memBuckets.get(k);
  if (!cur) {
    memBuckets.set(k, { count: 1, expiresAt: (bucket + 1) * windowSec * 1000 });
    return true;
  }
  cur.count += 1;
  return cur.count <= limit;
}

/**
 * 简单固定窗口限流。Redis 可用时走 Redis（多副本共享）；
 * Redis 未配置/不可用时走本进程内存兜底，不再完全放行——
 * 主库挂了才算事故，但限流挂了也不应让登录/注册被爆破。
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return memCheck(key, limit, windowSec);

  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const k = `rl:${key}:${windowSec}:${bucket}`;
  try {
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, windowSec);
    return n <= limit;
  } catch {
    return memCheck(key, limit, windowSec);
  }
}

export async function clientIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  // Caddy 把真实客户端 IP 追加在 XFF 末尾；首段是客户端自填的，不可信。
  // 取末段：攻击者伪造前面的段也绕不过限流。
  const parts =
    h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return parts.length > 0 ? parts[parts.length - 1] : "local";
}
