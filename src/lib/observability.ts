/**
 * 可观测性：404/5xx 聚合、Web Vitals、邮件失败、在线明细。
 * 写入都走「按天聚合 + upsert」，量级可控；查询供后台展示。
 */
import { db } from "./db";
import { getRedis } from "./redis";
import { logger } from "./logger";
import { dayForDb, dayFromDb, detectDevice, normalizePath } from "./visit-stats";

/* ---------------- 404 / 5xx ---------------- */

export interface ErrorInput {
  kind: "404" | "500";
  path: string;
  referrer?: string | null;
  ua?: string | null;
}

export async function recordError(input: ErrorInput): Promise<void> {
  const device = detectDevice(input.ua);
  if (device === "bot") return; // 爬虫扫目录产生的 404 不算问题

  const day = dayForDb(new Date());
  const path = normalizePath(input.path);
  const referrer = (input.referrer ?? "").slice(0, 120);
  const ua = (input.ua ?? "").slice(0, 160);

  try {
    await db.errorDaily.upsert({
      where: { day_kind_path: { day, kind: input.kind, path } },
      create: { day, kind: input.kind, path, count: 1, lastReferrer: referrer, lastUa: ua },
      update: { count: { increment: 1 }, lastAt: new Date(), lastReferrer: referrer, lastUa: ua },
    });
  } catch (error) {
    logger.warn("observability.error_record_failed", { path, error: error instanceof Error ? error.message : String(error) });
  }
}

export interface ErrorRow {
  kind: string;
  path: string;
  count: number;
  lastAt: Date;
  lastReferrer: string;
}

export async function getTopErrors(days = 7, limit = 12): Promise<ErrorRow[]> {
  const since = dayForDb(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  const rows = await db.errorDaily
    .groupBy({
      by: ["kind", "path"],
      where: { day: { gte: since } },
      _sum: { count: true },
      _max: { lastAt: true },
      orderBy: { _sum: { count: "desc" } },
      take: limit,
    })
    .catch(() => []);
  const referrers = await db.errorDaily
    .findMany({ where: { day: { gte: since } }, select: { kind: true, path: true, lastReferrer: true }, orderBy: { lastAt: "desc" }, take: 200 })
    .catch(() => []);
  const refMap = new Map(referrers.map((r) => [`${r.kind}|${r.path}`, r.lastReferrer]));
  return rows.map((r) => ({
    kind: r.kind,
    path: r.path,
    count: r._sum.count ?? 0,
    lastAt: r._max.lastAt ?? new Date(),
    lastReferrer: refMap.get(`${r.kind}|${r.path}`) ?? "",
  }));
}

export async function getErrorTotals(days = 7): Promise<{ notFound: number; server: number }> {
  const since = dayForDb(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  const rows = await db.errorDaily
    .groupBy({ by: ["kind"], where: { day: { gte: since } }, _sum: { count: true } })
    .catch(() => []);
  const pick = (kind: string) => rows.find((r) => r.kind === kind)?._sum.count ?? 0;
  return { notFound: pick("404"), server: pick("500") };
}

/* ---------------- Web Vitals ---------------- */

/** good 阈值（Core Web Vitals 官方标准） */
export const GOOD_THRESHOLD: Record<string, number> = {
  LCP: 2500,
  INP: 200,
  CLS: 0.1,
  FCP: 1800,
  TTFB: 800,
};

/** 该指标值是否达到「良好」 */
export function isVitalGood(metric: string, value: number): boolean {
  const limit = GOOD_THRESHOLD[metric.toUpperCase()];
  return limit === undefined ? false : value <= limit;
}

export interface VitalInput {
  metric: string;
  value: number;
  path?: string;
  ua?: string | null;
}

export async function recordVital(input: VitalInput): Promise<void> {
  const metric = input.metric.toUpperCase();
  if (!(metric in GOOD_THRESHOLD) || !Number.isFinite(input.value) || input.value < 0) return;
  const device = detectDevice(input.ua) === "mobile" ? "mobile" : "desktop";

  const day = dayForDb(new Date());
  const good = isVitalGood(metric, input.value) ? 1 : 0;
  try {
    await db.vitalDaily.upsert({
      where: { day_metric_device: { day, metric, device } },
      create: { day, metric, device, count: 1, sumValue: input.value, goodCount: good, worst: input.value },
      update: {
        count: { increment: 1 },
        sumValue: { increment: input.value },
        goodCount: { increment: good },
      },
    });
    // worst 取最大值（Prisma 无 max 自增，单独判断一次）
    await db.$executeRaw`
      UPDATE "VitalDaily" SET worst = GREATEST(worst, ${input.value})
      WHERE day = ${day}::date AND metric = ${metric} AND device = ${device}`;
  } catch (error) {
    logger.warn("observability.vital_record_failed", { metric, error: error instanceof Error ? error.message : String(error) });
  }
}

export interface VitalRow {
  metric: string;
  device: string;
  count: number;
  avg: number;
  goodRate: number;
  worst: number;
}

export async function getVitals(days = 7): Promise<VitalRow[]> {
  const since = dayForDb(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  const rows = await db.vitalDaily
    .groupBy({
      by: ["metric", "device"],
      where: { day: { gte: since } },
      _sum: { count: true, sumValue: true, goodCount: true },
      _max: { worst: true },
    })
    .catch(() => []);
  return rows
    .map((r) => {
      const count = r._sum.count ?? 0;
      return {
        metric: r.metric,
        device: r.device,
        count,
        avg: count ? (r._sum.sumValue ?? 0) / count : 0,
        goodRate: count ? ((r._sum.goodCount ?? 0) / count) * 100 : 0,
        worst: r._max.worst ?? 0,
      };
    })
    .sort((a, b) => a.metric.localeCompare(b.metric) || a.device.localeCompare(b.device));
}

/* ---------------- 邮件失败 ---------------- */

export async function recordMailFailure(to: string, subject: string, error: string): Promise<void> {
  try {
    await db.mailFailure.create({ data: { to: to.slice(0, 200), subject: subject.slice(0, 200), error: error.slice(0, 400) } });
  } catch {
    /* 留痕失败不影响主流程 */
  }
}

export async function getMailFailures(limit = 5): Promise<{ total: number; rows: { to: string; subject: string; error: string; createdAt: Date }[] }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [total, rows] = await Promise.all([
    db.mailFailure.count({ where: { createdAt: { gte: since } } }).catch(() => 0),
    db.mailFailure.findMany({ orderBy: { createdAt: "desc" }, take: limit, select: { to: true, subject: true, error: true, createdAt: true } }).catch(() => []),
  ]);
  return { total, rows };
}

/* ---------------- 在线明细 ---------------- */

export interface OnlineDetail {
  users: { username: string; role: string }[];
  anonymous: number;
  total: number;
}

/** 在线集合里混着「登录用户 id」与「匿名 IP」，这里拆开：用户查库，IP 只报数量 */
export async function getOnlineDetail(): Promise<OnlineDetail | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const now = Date.now();
    await redis.zremrangebyscore("online", 0, now - 5 * 60 * 1000);
    const entries = await redis.zrange("online", 0, -1);
    const ids = entries.filter((e) => !/^[\d.:a-f]+$/i.test(e) || e.length > 26);
    const anonymous = entries.length - ids.length;
    const users = ids.length
      ? await db.user.findMany({ where: { id: { in: ids } }, select: { username: true, role: true }, orderBy: { username: "asc" }, take: 50 })
      : [];
    return { users, anonymous, total: entries.length };
  } catch {
    return null;
  }
}

/* ---------------- 备份状态 ---------------- */

export interface BackupStatus {
  at: string;
  ok: boolean;
  sizeBytes: number | null;
  fileCount: number | null;
  snapshots: number | null;
  note: string;
}

/** 读取备份容器写下的状态文件（app 只读挂载 ./backups） */
export async function getBackupStatus(): Promise<BackupStatus | null> {
  try {
    const { readFile, stat } = await import("node:fs/promises");
    const root = process.env.BACKUP_STATUS_DIR ?? "/srv/backups";
    const raw = await readFile(`${root}/last-backup.json`, "utf8");
    const parsed = JSON.parse(raw) as Partial<BackupStatus>;
    const info = await stat(`${root}/last-backup.json`).catch(() => null);
    return {
      at: parsed.at ?? info?.mtime.toISOString() ?? "",
      ok: parsed.ok ?? true,
      sizeBytes: parsed.sizeBytes ?? null,
      fileCount: parsed.fileCount ?? null,
      snapshots: parsed.snapshots ?? null,
      note: parsed.note ?? "",
    };
  } catch {
    return null;
  }
}

export { dayFromDb };
