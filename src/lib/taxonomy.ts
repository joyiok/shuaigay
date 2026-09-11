/**
 * 主题标签：解析输入、生成 slug、维护计数、按标签取主题。
 * 标签是轻量的（最多 3 个/主题），不做独立管理后台，随用随建。
 */
import type { Prisma } from "@prisma/client";
import { db } from "./db";

export const MAX_TAGS_PER_THREAD = 3;
export const TAG_MAX_LEN = 12;

/** 支持「，,、空格 # ;」分隔，去重并截断 */
export function parseTagInput(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const parts = raw
    .split(/[,，、;；\s#]+/)
    .map((t) => t.trim().replace(/^#+/, ""))
    .filter((t) => t.length > 0 && t.length <= TAG_MAX_LEN);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= MAX_TAGS_PER_THREAD) break;
  }
  return out;
}

/** 中文标签直接进 URL（客户端 encodeURIComponent 会处理），拉丁字母统一小写 */
export function tagSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_]/gu, "")
    .slice(0, 40) || "tag";
}

/** 写入标签并维护计数（在事务里调用，或独立调用） */
export async function attachTags(
  client: Prisma.TransactionClient | typeof db,
  threadId: string,
  names: string[],
): Promise<void> {
  if (names.length === 0) return;
  for (const name of names) {
    const slug = tagSlug(name);
    if (!slug) continue;
    const tag = await client.tag.upsert({
      where: { name },
      create: { name, slug, count: 0 },
      update: {},
      select: { id: true },
    });
    const linked = await client.threadTag
      .create({ data: { threadId, tagId: tag.id } })
      .then(() => true)
      .catch(() => false);
    if (linked) await client.tag.update({ where: { id: tag.id }, data: { count: { increment: 1 } } });
  }
}

/** 批量取主题的标签（列表页用，一次查询） */
export async function tagsForThreads(threadIds: string[]): Promise<Map<string, { name: string; slug: string }[]>> {
  if (threadIds.length === 0) return new Map();
  const rows = await db.threadTag
    .findMany({
      where: { threadId: { in: threadIds } },
      select: { threadId: true, tag: { select: { name: true, slug: true } } },
    })
    .catch(() => []);
  const map = new Map<string, { name: string; slug: string }[]>();
  for (const r of rows) {
    const arr = map.get(r.threadId) ?? [];
    arr.push(r.tag);
    map.set(r.threadId, arr);
  }
  return map;
}

export async function tagsForThread(threadId: string): Promise<{ name: string; slug: string }[]> {
  return (await tagsForThreads([threadId])).get(threadId) ?? [];
}

/** 热门标签（首页/标签页侧栏用） */
export async function hotTags(limit = 20): Promise<{ name: string; slug: string; count: number }[]> {
  return db.tag
    .findMany({ where: { count: { gt: 0 } }, orderBy: [{ count: "desc" }, { name: "asc" }], take: limit, select: { name: true, slug: true, count: true } })
    .catch(() => []);
}
