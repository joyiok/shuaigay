/**
 * 结构化分级 JSON 日志 - SHUAI GAY 可观测
 * 级别: INFO / WARN / ERROR (及 debug)
 * 字段: time, ts, level, requestId, msg, meta (+ 平铺 meta 兼容)
 * 输出: 统一到 stdout (process.stdout.write)，单行 JSON，便于 Loki/CloudWatch 采集
 * 特性: 通过 AsyncLocalStorage 透传 requestId；无上下文时自动生成短 id，保证每行都有 requestId
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "debug" | "info" | "warn" | "error";

// AsyncLocalStorage 承载单次请求 requestId，跨 async/await 透传
export const requestIdStorage = new AsyncLocalStorage<string>();

export function getRequestId(): string | undefined {
  try {
    return requestIdStorage.getStore();
  } catch {
    return undefined;
  }
}

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestIdStorage.run(requestId, fn);
}

export function generateRequestId(): string {
  try {
    // Node 19+ 有 crypto.randomUUID
    const { randomUUID } = require("node:crypto") as { randomUUID: () => string };
    return randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  // 提取 requestId：优先取 fields.requestId，其次取 AsyncLocalStorage，否则自动生成
  let requestId: string | undefined = getRequestId();
  let meta: Record<string, unknown> | undefined;

  if (fields && typeof fields === "object") {
    const { requestId: rid, ...rest } = fields as Record<string, unknown> & { requestId?: unknown };
    if (typeof rid === "string" && rid) requestId = rid;
    if (Object.keys(rest).length > 0) meta = rest;
  }

  if (!requestId) {
    requestId = generateRequestId();
  }

  const time = nowIso();

  // 标准结构：time / ts + level + requestId + msg + meta
  // 同时平铺 meta 到顶层，兼顾新查询 (meta.xxx) 与旧查询 (直接 xxx)
  const entry: Record<string, unknown> = {
    time,
    ts: time,
    level,
    requestId,
    msg,
    ...(meta ? { meta } : {}),
    ...(meta ?? {}),
  };

  const line = JSON.stringify(entry);

  // INFO / WARN / ERROR 统一输出到 stdout（便于容器日志驱动一次性采集，不依赖 stderr）
  // 上层可按 JSON.level 过滤分级，无需区分 fd
  process.stdout.write(line + "\n");
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>): void => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>): void => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>): void => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>): void => emit("error", msg, fields),
};

// 兼容旧调用 `log.info` 也支持直接函数
export const log = logger;
export default logger;

// 便于检索的级别常量注释：INFO / WARN / ERROR
void ["INFO", "WARN", "ERROR"];
