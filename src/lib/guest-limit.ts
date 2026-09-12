/**
 * 游客试读额度：每天免登录可读 N 个主题，超限后必须登录/注册。
 * - 计数：Redis 按 IP 计日次（`guestview:{站点日}:{ip}`）；Redis 不可用时退化到 cookie 计数
 * - 同一主题 5 分钟内重复看不重复计（刷新/回退不烧额度）
 * - 爬虫一律放行（保 SEO；sitemap/索引不受影响）
 * - limit = 0 时功能关闭，一切照旧
 */
import { z } from "zod";
import { db } from "./db";
import { getRedis } from "./redis";
import { dayKey } from "./visit-stats";

export const GUEST_COOKIE = "sg_gv";
/** 同一主题 N 秒内重复访问不重复计数 */
export const GUEST_REPEAT_WINDOW_SEC = 300;

export const guestSettingsSchema = z.object({
  guestThreadLimit: z.coerce.number().int().min(0).max(10000),
});

export interface GuestLimitConfig {
  /** 每天免登录可读主题数，0 = 不限 */
  threadLimit: number;
}

export const DEFAULT_GUEST_CONFIG: GuestLimitConfig = { threadLimit: 0 };

let cache: GuestLimitConfig | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

export async function getGuestLimitConfig(): Promise<GuestLimitConfig> {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;
  try {
    const row = await db.siteSetting.findUnique({
      where: { id: "site" },
      select: { guestThreadLimit: true },
    });
    if (row) {
      cache = { threadLimit: Math.max(0, row.guestThreadLimit) };
      cacheAt = now;
      return cache;
    }
  } catch {
    // DB 不可用时回退关闭，不阻断阅读
  }
  return cache ?? DEFAULT_GUEST_CONFIG;
}

/** 后台保存后调用，60s 缓存立即失效 */
export function clearGuestLimitConfigCache(): void {
  cache = null;
  cacheAt = 0;
}

export interface GuestCookieState {
  count: number;
  lastThreadId: string;
  lastTs: number;
}

/** 解析游客计数 cookie：`{站点日}.{今日已看}.{上次主题}.{上次时间戳}`，过期/非法一律归零 */
export function parseGuestCookie(raw: string | null | undefined, today: string): GuestCookieState {
  const empty: GuestCookieState = { count: 0, lastThreadId: "", lastTs: 0 };
  if (!raw) return empty;
  const parts = raw.split(".");
  if (parts.length !== 4 || parts[0] !== today) return empty;
  const count = Number(parts[1]);
  const lastTs = Number(parts[3]);
  if (!Number.isFinite(count) || count < 0 || !Number.isFinite(lastTs) || lastTs < 0) return empty;
  return { count: Math.floor(count), lastThreadId: parts[2] ?? "", lastTs: Math.floor(lastTs) };
}

export function buildGuestCookie(today: string, state: GuestCookieState): string {
  return `${today}.${state.count}.${state.lastThreadId}.${state.lastTs}`;
}

/** 同一主题短时间内重复看：不烧额度 */
export function isFreshRepeat(state: GuestCookieState, threadId: string, nowSec: number): boolean {
  return (
    state.lastThreadId === threadId &&
    state.lastTs > 0 &&
    nowSec - state.lastTs < GUEST_REPEAT_WINDOW_SEC
  );
}

export interface GateDecision {
  gated: boolean;
  remaining: number;
  limit: number;
  count: number;
}

/** 纯判定：今日已看 count（含本次）是否超限 */
export function gateDecision(limit: number, count: number): GateDecision {
  if (limit <= 0) return { gated: false, remaining: Number.MAX_SAFE_INTEGER, limit, count };
  return { gated: count > limit, remaining: Math.max(0, limit - count), limit, count };
}

/**
 * 计一次游客阅读。Redis 主计（按 IP 按天），不可用时用 cookie 计数兜底。
 * 返回本次计后的今日总数与计数来源。
 */
export async function countGuestView(ip: string, fallbackCount: number): Promise<{ count: number; viaRedis: boolean }> {
  const redis = getRedis();
  if (redis) {
    try {
      const key = `guestview:${dayKey(new Date())}:${ip}`;
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 3 * 86400);
      return { count: n, viaRedis: true };
    } catch {
      // 降级走 cookie
    }
  }
  return { count: fallbackCount + 1, viaRedis: false };
}
