/**
 * 阅读进度与追更：
 * - ReadingProgress 记录「谁在读哪一篇、读到第几章/哪一层」，跨设备生效
 * - Favorite.lastSeenPosts 记录「上次打开这部作品时的章节数」，用来算有没有更新
 */
import { db } from "./db";

export interface ProgressRow {
  threadId: string;
  postId: string | null;
  chapter: number;
  updatedAt: Date;
}

/** 写进度（小说传 chapter，普通主题传 postId） */
export async function saveProgress(opts: {
  userId: string;
  threadId: string;
  postId?: string | null;
  chapter?: number;
}): Promise<void> {
  const chapter = Math.max(0, Math.floor(opts.chapter ?? 0));
  await db.readingProgress.upsert({
    where: { userId_threadId: { userId: opts.userId, threadId: opts.threadId } },
    create: { userId: opts.userId, threadId: opts.threadId, postId: opts.postId ?? null, chapter },
    update: { postId: opts.postId ?? null, chapter },
  });

  // 正在读 = 这一篇的更新已经看到了：把追更基准推到当前章节数
  if (chapter > 0) {
    const fav = await db.favorite.findUnique({
      where: { userId_threadId: { userId: opts.userId, threadId: opts.threadId } },
      select: { id: true, lastSeenPosts: true, thread: { select: { authorId: true, status: true } } },
    });
    if (fav && fav.lastSeenPosts < chapter && fav.thread.status !== "deleted") {
      void db.favorite.update({ where: { id: fav.id }, data: { lastSeenPosts: chapter } }).catch(() => {});
    }
  }
}

export async function getProgress(userId: string, threadId: string): Promise<ProgressRow | null> {
  const row = await db.readingProgress
    .findUnique({
      where: { userId_threadId: { userId, threadId } },
      select: { threadId: true, postId: true, chapter: true, updatedAt: true },
    })
    .catch(() => null);
  return row ?? null;
}

/** 一次取多篇的进度（书架、追更流用） */
export async function getProgressMap(userId: string, threadIds: string[]): Promise<Map<string, ProgressRow>> {
  if (threadIds.length === 0) return new Map();
  const rows = await db.readingProgress
    .findMany({
      where: { userId, threadId: { in: threadIds } },
      select: { threadId: true, postId: true, chapter: true, updatedAt: true },
    })
    .catch(() => []);
  return new Map(rows.map((r) => [r.threadId, r]));
}

/** 最近在读（个人主页/首页用） */
export async function getRecentReading(userId: string, limit = 6) {
  const rows = await db.readingProgress.findMany({
    where: { userId, chapter: { gt: 0 }, thread: { status: { not: "deleted" } } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      chapter: true,
      updatedAt: true,
      postId: true,
      thread: { select: { id: true, title: true, board: { select: { slug: true } } } },
    },
  }).catch(() => []);
  return rows;
}
