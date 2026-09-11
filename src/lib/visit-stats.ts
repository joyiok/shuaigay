/**
 * 站点流量统计：PV 按「日 + 路径 + 国家 + 来源 + 设备」聚合进 Postgres，
 * UV 用 Redis HyperLogLog（按天一个 key，误差 ~0.8%，不落库）。
 *
 * 地区来源：Cloudflare 自动加的 CF-IPCountry（无需 GeoIP 库）；
 * 若在 CF 后台打开「Add visitor location headers」，还能拿到 cf-ipcity / cf-ipregion。
 */
import { db } from "./db";
import { getRedis } from "./redis";
import { logger } from "./logger";

/** 站点时区（统计按 UTC+8 分日） */
const TZ_OFFSET_MIN = 8 * 60;

/** 哪些路径按「类型」聚合，避免 /t/每个主题一条记录撑爆聚合表 */
const PATH_RULES: [RegExp, string][] = [
  [/^\/t\/[^/]+$/, "/t/[id]"],
  [/^\/c\/[^/]+$/, "/c/[slug]"],
  [/^\/u\/[^/]+$/, "/u/[username]"],
  [/^\/messages\/[^/]+$/, "/messages/[username]"],
  [/^\/api\/avatar$/, "/api/avatar"],
  [/^\/_next\//, "/_next/*"],
];

export function normalizePath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, "") || "/";
  for (const [re, replacement] of PATH_RULES) {
    if (re.test(clean)) return replacement;
  }
  return clean.slice(0, 120);
}

export function detectDevice(ua: string | null | undefined): "desktop" | "mobile" | "bot" {
  const s = (ua ?? "").toLowerCase();
  if (!s) return "bot";
  if (/(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|python-requests|curl|wget|headless|monitor|uptime)/.test(s)) return "bot";
  if (/(android|iphone|ipad|ipod|mobile|micromobile|windows phone|harmonyos)/.test(s)) return "mobile";
  return "desktop";
}

export function referrerHost(referrer: string | null | undefined): string {
  if (!referrer) return "";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    // 站内跳转不算来源
    if (host.endsWith("shuai.gay")) return "";
    return host.slice(0, 60);
  } catch {
    return "";
  }
}

/** 访客指纹（只用于当天 UV 去重，存 Redis 的 HLL 里，不落库、不可逆） */
async function visitorHash(ip: string, ua: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const day = dayKey(new Date());
  return createHash("sha256").update(`${day}|${ip}|${ua}`).digest("hex").slice(0, 24);
}

/** 站点时区下的日期串（YYYY-MM-DD）：Redis UV key、展示都用它 */
export function dayKey(d: Date): string {
  const shifted = new Date(d.getTime() + TZ_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * 写入 @db.Date 用：把「站点当天」转成 UTC 零点的 Date。
 * 直接存 dayStart() 会被 Postgres 按 UTC 截断成前一天，导致今日 PV 计不进去。
 */
export function dayForDb(d: Date): Date {
  const [y, m, day] = dayKey(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

/** 从 @db.Date 读出来还原成站点日期串 */
export function dayFromDb(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface VisitInput {
  path: string;
  country?: string | null;
  city?: string | null;
  referrer?: string | null;
  ua?: string | null;
  ip?: string | null;
}

/** 记录一次文档访问（调用方用 after() 放到响应之后，失败不影响渲染） */
export async function recordVisit(input: VisitInput): Promise<void> {
  const now = new Date();
  const day = dayForDb(now);
  const device = detectDevice(input.ua);
  const country = (input.country ?? "").trim().toUpperCase().slice(0, 2) || "XX";
  const path = normalizePath(input.path);
  const referrer = referrerHost(input.referrer);

  try {
    await db.visitDaily.upsert({
      where: { day_path_country_referrer_device: { day, path, country, referrer, device } },
      create: { day, path, country, referrer, device, pv: 1 },
      update: { pv: { increment: 1 } },
    });
  } catch (error) {
    logger.warn("visit.record_failed", { path, error: error instanceof Error ? error.message : String(error) });
  }

  const redis = getRedis();
  if (redis) {
    try {
      const dayStr = dayKey(now);
      const key = `visit:uv:${dayStr}`;
      await redis.pfadd(key, await visitorHash(input.ip || "unknown", input.ua || ""));
      await redis.expire(key, 60 * 60 * 24 * 120); // 保留 120 天
      // 近 5 分钟活跃访客（实时看板用）
      await redis.zadd("visit:recent", now.getTime(), `${input.ip || "unknown"}|${(input.ua || "").slice(0, 40)}`);
      await redis.zremrangebyscore("visit:recent", 0, now.getTime() - 5 * 60 * 1000);
    } catch {
      /* Redis 挂了不影响统计落库 */
    }
  }
}

/** 指定日期的 UV（Redis HLL；Redis 不可用时返回 null） */
export async function getDailyUv(day: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.pfcount(`visit:uv:${day}`);
  } catch {
    return null;
  }
}

/** 近 5 分钟活跃访客数 */
export async function getRealtimeVisitors(): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.zcard("visit:recent");
  } catch {
    return null;
  }
}

export interface TrafficDay {
  day: string;
  pv: number;
  uv: number | null;
}

export interface TrafficSummary {
  todayPv: number;
  todayUv: number | null;
  yesterdayPv: number;
  weekPv: number;
  monthPv: number;
  realtime: number | null;
  days: TrafficDay[];
}

/** 概览：今日/昨日/近7日/近30日 + 逐日曲线（近 N 天） */
export async function getTrafficSummary(chartDays = 14): Promise<TrafficSummary> {
  const now = new Date();
  const since = dayForDb(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
  const rows = await db.visitDaily
    .groupBy({ by: ["day"], where: { day: { gte: since } }, _sum: { pv: true } })
    .catch(() => [] as { day: Date; _sum: { pv: number | null } }[]);

  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(dayFromDb(row.day), row._sum.pv ?? 0);
  const pvOf = (key: string) => byDay.get(key) ?? 0;

  const keyOf = (offsetDays: number) => dayKey(new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000));
  const todayKey = keyOf(0);
  let weekPv = 0;
  let monthPv = 0;
  for (let i = 0; i < 30; i += 1) {
    const pv = pvOf(keyOf(i));
    monthPv += pv;
    if (i < 7) weekPv += pv;
  }

  const days: TrafficDay[] = [];
  for (let i = chartDays - 1; i >= 0; i -= 1) {
    const key = keyOf(i);
    days.push({ day: key, pv: pvOf(key), uv: await getDailyUv(key) });
  }

  return {
    todayPv: pvOf(todayKey),
    todayUv: await getDailyUv(todayKey),
    yesterdayPv: pvOf(keyOf(1)),
    weekPv,
    monthPv,
    realtime: await getRealtimeVisitors(),
    days,
  };
}

/** 近 N 天国家分布 */
export async function getTopCountries(days = 7, limit = 12) {
  const since = dayForDb(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  const rows = await db.visitDaily
    .groupBy({ by: ["country"], where: { day: { gte: since } }, _sum: { pv: true }, orderBy: { _sum: { pv: "desc" } }, take: limit })
    .catch(() => [] as { country: string; _sum: { pv: number | null } }[]);
  return rows.map((r) => ({ country: r.country, pv: r._sum.pv ?? 0 }));
}

/** 近 N 天来源域名 */
export async function getTopReferrers(days = 7, limit = 8) {
  const since = dayForDb(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  const rows = await db.visitDaily
    .groupBy({
      by: ["referrer"],
      where: { day: { gte: since }, NOT: { referrer: "" } },
      _sum: { pv: true },
      orderBy: { _sum: { pv: "desc" } },
      take: limit,
    })
    .catch(() => [] as { referrer: string; _sum: { pv: number | null } }[]);
  return rows.map((r) => ({ referrer: r.referrer, pv: r._sum.pv ?? 0 }));
}

/** 近 N 天热门页面（归一化路径） */
export async function getTopPaths(days = 7, limit = 10) {
  const since = dayForDb(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  const rows = await db.visitDaily
    .groupBy({ by: ["path"], where: { day: { gte: since } }, _sum: { pv: true }, orderBy: { _sum: { pv: "desc" } }, take: limit })
    .catch(() => [] as { path: string; _sum: { pv: number | null } }[]);
  return rows.map((r) => ({ path: r.path, pv: r._sum.pv ?? 0 }));
}

/** 近 N 天设备分布 */
export async function getDeviceSplit(days = 7) {
  const since = dayForDb(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  const rows = await db.visitDaily
    .groupBy({ by: ["device"], where: { day: { gte: since } }, _sum: { pv: true } })
    .catch(() => [] as { device: string; _sum: { pv: number | null } }[]);
  return rows.map((r) => ({ device: r.device, pv: r._sum.pv ?? 0 })).sort((a, b) => b.pv - a.pv);
}

/** 常见国家/地区中文名（够用即可，其余回退显示代码） */
const COUNTRY_NAMES: Record<string, string> = {
  CN: "中国大陆", HK: "中国香港", TW: "中国台湾", MO: "中国澳门",
  US: "美国", JP: "日本", KR: "韩国", SG: "新加坡", MY: "马来西亚",
  TH: "泰国", VN: "越南", PH: "菲律宾", ID: "印度尼西亚", IN: "印度",
  AU: "澳大利亚", NZ: "新西兰", CA: "加拿大", GB: "英国", IE: "爱尔兰",
  FR: "法国", DE: "德国", NL: "荷兰", BE: "比利时", ES: "西班牙", IT: "意大利",
  PT: "葡萄牙", CH: "瑞士", AT: "奥地利", SE: "瑞典", NO: "挪威", DK: "丹麦",
  FI: "芬兰", PL: "波兰", CZ: "捷克", RU: "俄罗斯", UA: "乌克兰", TR: "土耳其",
  BR: "巴西", AR: "阿根廷", MX: "墨西哥", CL: "智利", ZA: "南非", AE: "阿联酋",
  IL: "以色列", SA: "沙特", EG: "埃及", NG: "尼日利亚", KE: "肯尼亚",
  XX: "未知",
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}
