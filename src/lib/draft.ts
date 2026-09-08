/**
 * 草稿与阅读位置:localStorage 持久化。
 * 纯函数 + 可注入 storage,方便单测;组件层只负责接线。
 */

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** SSR 下没有 window,调用方一律经此拿 storage(拿不到返回 null) */
export function getLocalStorage(): DraftStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 枚举 storage 里的所有键(草稿箱用)。
 * DraftStorage 只要求读写删,能枚举的实现才返回键列表,否则返回空数组。
 */
export function listKeys(store: DraftStorage | null): string[] {
  if (!store) return [];
  const enumerable = store as unknown as { length?: unknown; key?: unknown };
  if (typeof enumerable.length !== "number" || typeof enumerable.key !== "function") return [];
  const key = enumerable.key as (index: number) => string | null;
  const out: string[] = [];
  for (let i = 0; i < enumerable.length; i++) {
    const k = key.call(store, i);
    if (k) out.push(k);
  }
  return out;
}

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const READPOS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type DraftKind = "reply" | "new" | "newtitle" | "msg";

/** 草稿键:回复/新帖正文/新帖标题/私信各自隔离 */
export function draftKey(kind: DraftKind, id: string, userId: string): string {
  return `sg:draft:${userId}:${kind}:${id}`;
}

export function readPosKey(threadId: string): string {
  return `sg:readpos:${threadId}`;
}

/** 草稿箱列表项：新主题的正文与标题草稿合并成一条 */
export interface DraftEntry {
  /** 关联的 localStorage 键（新主题会有 2 个：正文 + 标题） */
  keys: string[];
  kind: "reply" | "new" | "msg";
  /** 回复=threadId，新主题=board slug，私信=对方用户名 */
  id: string;
  text: string;
  titleText: string;
  /** 最近一次更新时间戳 */
  at: number;
}

const DRAFT_KINDS = new Set<string>(["reply", "new", "newtitle", "msg"]);

function readEntry(store: DraftStorage, key: string, now: number): { text: string; at: number } | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (typeof parsed.text !== "string" || !parsed.text) return null;
    const at = typeof parsed.at === "number" ? parsed.at : now;
    if (now - at > DRAFT_TTL_MS) {
      store.removeItem(key);
      return null;
    }
    return { text: parsed.text, at };
  } catch {
    return null;
  }
}

/**
 * 扫描某用户在本机的全部草稿（按更新时间倒序）。
 * 只认 `sg:draft:<userId>:<kind>:<id>`；过期的顺手清掉；无法枚举的实现返回空数组。
 */
export function scanDrafts(store: DraftStorage | null, userId: string, now = Date.now()): DraftEntry[] {
  if (!store) return [];
  const prefix = `sg:draft:${userId}:`;
  const items = new Map<string, DraftEntry>();
  for (const key of listKeys(store).slice(0, 500)) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const sep = rest.indexOf(":");
    if (sep < 0) continue;
    const kind = rest.slice(0, sep);
    const id = rest.slice(sep + 1);
    if (!id || !DRAFT_KINDS.has(kind)) continue;
    const entry = readEntry(store, key, now);
    if (!entry) continue;
    const groupKey = kind === "newtitle" ? `new:${id}` : `${kind}:${id}`;
    const existing = items.get(groupKey);
    if (existing) {
      existing.keys.push(key);
      existing.at = Math.max(existing.at, entry.at);
      if (kind === "newtitle") existing.titleText = entry.text;
      else existing.text = entry.text;
    } else {
      items.set(groupKey, {
        keys: [key],
        kind: (kind === "newtitle" ? "new" : kind) as DraftEntry["kind"],
        id,
        text: kind === "newtitle" ? "" : entry.text,
        titleText: kind === "newtitle" ? entry.text : "",
        at: entry.at,
      });
    }
  }
  return [...items.values()].sort((a, b) => b.at - a.at);
}

export function loadDraft(store: DraftStorage | null, key: string, now = Date.now()): string {
  if (!store) return "";
  try {
    const raw = store.getItem(key);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (typeof parsed.text !== "string") return "";
    if (typeof parsed.at === "number" && now - parsed.at > DRAFT_TTL_MS) {
      store.removeItem(key);
      return "";
    }
    return parsed.text;
  } catch {
    return "";
  }
}

export function saveDraft(store: DraftStorage | null, key: string, text: string): void {
  if (!store) return;
  try {
    if (!text) {
      store.removeItem(key);
      return;
    }
    store.setItem(key, JSON.stringify({ text, at: Date.now() }));
  } catch {
    /* 配额满/隐私模式:草稿直接丢弃,不打扰发帖 */
  }
}

export function clearDraft(store: DraftStorage | null, key: string): void {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* ignore */
  }
}

export interface ReadPos {
  postId: string;
  floor: string | null;
  at: number;
}

export function loadReadPos(store: DraftStorage | null, threadId: string, now = Date.now()): ReadPos | null {
  if (!store) return null;
  try {
    const raw = store.getItem(readPosKey(threadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { postId?: unknown; floor?: unknown; at?: unknown };
    if (typeof parsed.postId !== "string" || !parsed.postId) return null;
    if (typeof parsed.at === "number" && now - parsed.at > READPOS_TTL_MS) {
      store.removeItem(readPosKey(threadId));
      return null;
    }
    return {
      postId: parsed.postId,
      floor: typeof parsed.floor === "string" ? parsed.floor : null,
      at: typeof parsed.at === "number" ? parsed.at : now,
    };
  } catch {
    return null;
  }
}

export function saveReadPos(
  store: DraftStorage | null,
  threadId: string,
  pos: { postId: string; floor: string | null },
): void {
  if (!store || !pos.postId) return;
  try {
    store.setItem(readPosKey(threadId), JSON.stringify({ ...pos, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

/** 从楼层 li 里的 span 文本中抠 #N 楼层号 */
export function findFloorLabel(candidates: readonly string[]): string | null {
  for (const t of candidates) {
    if (/^#\d+$/.test(t.trim())) return t.trim();
  }
  return null;
}
