/**
 * 极简结构化日志:输出单行 JSON,便于容器日志采集(loki / cloudwatch)。
 * 生产环境可直接被 Docker / Caddy 日志驱动收集,本地开发也易读。
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

function nowIso(): string {
  return new Date().toISOString();
}

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    ts: nowIso(),
    level,
    msg,
    ...fields,
  };
  // error 额外走 stderr,其他走 stdout,便于分级
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
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
