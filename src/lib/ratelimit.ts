import { getRedis } from "./redis";

/**
 * 简单固定窗口限流。Redis 不可用时放行(降级)——
 * 限流挂了论坛还能用,主库挂了才算事故。
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;

  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const k = `rl:${key}:${bucket}`;
  try {
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, windowSec);
    return n <= limit;
  } catch {
    return true;
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
