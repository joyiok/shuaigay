import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const start = Date.now();
  let dbStatus: "up" | "down" = "down";
  let redisStatus: "up" | "down" | "disabled" = "disabled";

  // 尝试从请求头透传 requestId，便于链路追踪
  let requestId: string | undefined;
  try {
    requestId = req.headers.get("x-request-id") ?? undefined;
    if (!requestId) {
      const { headers } = await import("next/headers");
      const h = await headers();
      requestId = h.get("x-request-id") ?? undefined;
    }
  } catch {
    // ignore
  }

  try {
    await db.$queryRaw`SELECT 1`;
    dbStatus = "up";
  } catch (e) {
    logger.error("health.db_down", { requestId, error: String(e) });
  }

  const redis = getRedis();
  if (!redis) {
    redisStatus = "disabled";
  } else {
    try {
      await redis.ping();
      redisStatus = "up";
    } catch (e) {
      redisStatus = "down";
      logger.warn("health.redis_down", { requestId, error: String(e) });
    }
  }

  const uptime = process.uptime();
  const status = dbStatus === "up" ? "ok" : "degraded";

  logger.info("health.check", { requestId, status, db: dbStatus, redis: redisStatus, uptime, latencyMs: Date.now() - start });

  return NextResponse.json(
    { status, uptime, db: dbStatus, redis: redisStatus },
    { headers: { "Cache-Control": "no-store" } },
  );
}
