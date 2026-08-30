/**
 * 敏感词检测:优先读取 prisma 的 SensitiveWord 表,缓存 1 分钟。
 * 表为空时回退到内置默认词表,保证首启即可用。
 */
import { db } from "./db";

const DEFAULT_WORDS = [
  "傻逼",
  "傻b",
  "草泥马",
  "操你妈",
  "妈逼",
  "狗娘养",
  "去死吧",
  "婊子",
  "nmsl",
  "cnm",
];

let cache: string[] | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

export async function getSensitiveWords(): Promise<string[]> {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;
  try {
    const rows = await db.sensitiveWord.findMany({ select: { word: true } });
    const words = rows.map((r) => r.word);
    if (words.length === 0) {
      cache = DEFAULT_WORDS;
    } else {
      cache = words;
    }
    cacheAt = now;
    return cache;
  } catch {
    // DB 不可用时回退到默认值,不阻断主流程
    return cache ?? DEFAULT_WORDS;
  }
}

/** 清空缓存,增删词后调用 */
export function clearSensitiveCache(): void {
  cache = null;
  cacheAt = 0;
}

/** 是否包含敏感词(大小写不敏感,异步查库) */
export async function containsSensitive(text: string): Promise<boolean> {
  const words = await getSensitiveWords();
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

/** 同步版本:仅用于极少数无需查库的场景(保留兼容) */
export function containsSensitiveSync(text: string): boolean {
  const words = cache ?? DEFAULT_WORDS;
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

/** 管理后台:列出全部词 */
export async function listSensitiveWords(): Promise<{ id: string; word: string; createdAt: Date }[]> {
  return db.sensitiveWord.findMany({ orderBy: { createdAt: "asc" } });
}

/** 添加词(去重,大小写不敏感去重交给调用方或 DB 唯一索引) */
export async function addSensitiveWord(raw: string): Promise<{ ok: boolean; error?: string }> {
  const word = raw.trim().toLowerCase();
  if (!word || word.length > 30) return { ok: false, error: "词不能为空且不超过 30 字" };
  try {
    await db.sensitiveWord.create({ data: { word } });
    clearSensitiveCache();
    return { ok: true };
  } catch {
    return { ok: false, error: "该词已存在" };
  }
}

export async function removeSensitiveWord(id: string): Promise<void> {
  await db.sensitiveWord.delete({ where: { id } }).catch(() => {});
  clearSensitiveCache();
}
