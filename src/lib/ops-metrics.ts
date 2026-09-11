/**
 * 运维指标：数据库大小、附件占用、Redis 内存。
 * 附件目录走一次有上限的目录遍历，结果在 Redis 缓存 5 分钟（后台刷新，不阻塞页面）。
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { getRedis } from "./redis";

const CACHE_KEY = "ops:metrics";
const CACHE_TTL = 300;
/** 遍历上限：超过就只报「已统计 N 个文件」，避免大目录把后台拖死 */
const MAX_FILES = 20000;

export interface DirUsage {
  bytes: number;
  files: number;
  truncated: boolean;
}

export async function dirUsage(root: string, maxFiles = MAX_FILES): Promise<DirUsage> {
  let bytes = 0;
  let files = 0;
  let truncated = false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (truncated || depth > 6) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        files += 1;
        if (files > maxFiles) {
          truncated = true;
          return;
        }
        try {
          const info = await stat(full);
          bytes += info.size;
        } catch {
          /* 文件刚被删除/无权限，跳过 */
        }
      }
    }
  }

  await walk(root, 0);
  return { bytes, files, truncated };
}

export interface OpsMetrics {
  dbBytes: number;
  uploads: DirUsage | null;
  redisMemory: string | null;
  generatedAt: string;
}

export async function getOpsMetrics(force = false): Promise<OpsMetrics> {
  const redis = getRedis();
  if (redis && !force) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached) as OpsMetrics;
    } catch {
      /* 缓存读失败就现算 */
    }
  }

  const uploadRoot = process.env.UPLOAD_DIR ?? "./uploads";
  const [dbSizeRow, uploads] = await Promise.all([
    db
      .$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`
      .then((rows) => rows[0]?.size ?? BigInt(0))
      .catch(() => BigInt(0)),
    dirUsage(uploadRoot).catch(() => null),
  ]);

  let redisMemory: string | null = null;
  if (redis) {
    try {
      const info = await redis.info("memory");
      redisMemory = /used_memory_human:([^\r\n]+)/.exec(info)?.[1]?.trim() ?? null;
    } catch {
      /* ignore */
    }
  }

  const metrics: OpsMetrics = {
    dbBytes: Number(dbSizeRow),
    uploads,
    redisMemory,
    generatedAt: new Date().toISOString(),
  };

  if (redis) {
    try {
      await redis.set(CACHE_KEY, JSON.stringify(metrics), "EX", CACHE_TTL);
    } catch {
      /* ignore */
    }
  }
  return metrics;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
