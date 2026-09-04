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

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const READPOS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type DraftKind = "reply" | "new" | "newtitle" | "msg";

/** 草稿键:回复/新帖正文/新帖标题/私信各自隔离 */
export function draftKey(kind: DraftKind, id: string): string {
  return `sg:draft:${kind}:${id}`;
}

export function readPosKey(threadId: string): string {
  return `sg:readpos:${threadId}`;
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
