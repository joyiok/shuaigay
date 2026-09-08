/**
 * 自动追更：定时挑符合条件的作品，自动生成下一章。
 *
 * 候选条件（全部满足）：
 * - 小说版、已发布、未锁定
 * - 开启了 autoContinue（AI 生成的作品默认开启；手工导入可显式开启）
 * - 至少有一章
 * - 最后一章距今超过配置的间隔小时数
 * - 标题不含「完结 / 全本」（粗判已完本）
 *
 * 配额：单轮最多 maxPerRun 部、每天最多 dailyCap 章（按 AuditLog 计数，跨重启有效）。
 */
import { db } from "./db";
import { getWriterSettings } from "./writer-settings";
import { generateNovelChapter } from "./novel-ai";
import { getRedis } from "./redis";
import { logger } from "./logger";
import { randomUUID } from "node:crypto";

export interface NovelAutoItem {
  threadId: string;
  title: string;
  ok: boolean;
  chapterCount?: number;
  error?: string;
}

export interface NovelAutoResult {
  status: "ok" | "disabled" | "capped" | "busy" | "empty";
  message: string;
  generated: number;
  checked: number;
  results: NovelAutoItem[];
}

function startOfUtcDay(now = Date.now()): Date {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function adminActorId(): Promise<string | null> {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return admin?.id ?? null;
}

/** 挑出本轮该续写的作品（导出便于测试与排查） */
export async function selectAutoCandidates(intervalHours: number, limit: number) {
  const cutoff = new Date(Date.now() - intervalHours * 3_600_000);
  return db.thread.findMany({
    where: {
      board: { slug: "novel" },
      status: "approved",
      locked: false,
      autoContinue: true,
      lastPostAt: { lt: cutoff },
      posts: { some: {} },
      AND: [{ NOT: { title: { contains: "完结" } } }, { NOT: { title: { contains: "全本" } } }],
    },
    orderBy: { lastPostAt: "asc" },
    take: Math.max(1, Math.min(5, limit)),
    select: { id: true, title: true, lastPostAt: true },
  });
}

/** 跑一轮自动追更；status 为 ok 时 results 里是逐部结果 */
export async function runNovelAuto(): Promise<NovelAutoResult> {
  const settings = await getWriterSettings();
  if (!settings.enabled || !settings.apiKey) {
    return { status: "disabled", message: "AI 写作未启用或未配置密钥", generated: 0, checked: 0, results: [] };
  }
  if (!settings.autoContinueEnabled) {
    return { status: "disabled", message: "自动追更未开启", generated: 0, checked: 0, results: [] };
  }

  // 防重入：cron / MCP / 后台按钮可能同时触发
  const redis = getRedis();
  const lockKey = "novel-auto:lock";
  const lockToken = randomUUID();
  if (redis) {
    const acquired = await redis.set(lockKey, lockToken, "EX", 900, "NX").catch(() => null);
    if (acquired !== "OK") {
      return { status: "busy", message: "自动追更正在运行，请稍后再试", generated: 0, checked: 0, results: [] };
    }
  }
  try {
    return await runLocked(settings);
  } finally {
    if (redis) await redis.del(lockKey).catch(() => {});
  }
}

/** 已持有锁后的主体逻辑 */
async function runLocked(settings: Awaited<ReturnType<typeof getWriterSettings>>): Promise<NovelAutoResult> {
  const todayCount = await db.auditLog.count({ where: { action: "novel_auto", createdAt: { gte: startOfUtcDay() } } }).catch(() => 0);
  const remaining = settings.autoContinueDailyCap - todayCount;
  if (remaining <= 0) {
    return { status: "capped", message: `今日自动追更已达上限（${settings.autoContinueDailyCap} 章）`, generated: 0, checked: 0, results: [] };
  }

  const candidates = await selectAutoCandidates(settings.autoContinueIntervalHours, Math.min(settings.autoContinueMaxPerRun, remaining));
  if (candidates.length === 0) {
    return { status: "empty", message: "没有到期的作品", generated: 0, checked: 0, results: [] };
  }

  const actor = await adminActorId();
  const results: NovelAutoItem[] = [];
  for (const thread of candidates) {
    const result = await generateNovelChapter({ threadId: thread.id, import: true, status: settings.autoContinueStatus });
    if (actor) {
      await db.auditLog
        .create({
          data: {
            actorId: actor,
            action: "novel_auto",
            targetType: "thread",
            targetId: thread.id,
            detail: result.ok ? `第 ${result.chapterCount} 章` : result.error?.slice(0, 100) ?? "失败",
          },
        })
        .catch(() => {});
    }
    results.push({ threadId: thread.id, title: thread.title, ok: result.ok, chapterCount: result.chapterCount, error: result.error });
    if (!result.ok) logger.warn("novel.auto_failed", { threadId: thread.id, error: result.error });
  }

  const generated = results.filter((r) => r.ok).length;
  logger.info("novel.auto_run", { checked: candidates.length, generated });
  return { status: "ok", message: `本轮续写 ${generated}/${candidates.length} 部`, generated, checked: candidates.length, results };
}
