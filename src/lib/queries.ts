import { Prisma } from "@prisma/client";
import { db } from "./db";
import { decodeCursor, encodeCursor, type Cursor } from "./cursor";
import { makeExcerpt } from "./excerpt";

const threadInclude = {
  author: { select: { username: true } },
  _count: { select: { posts: true } },
};

const postInclude = {
  author: { select: { username: true, role: true } },
  attachments: true,
};

type ThreadRow = Prisma.ThreadGetPayload<{ include: typeof threadInclude }>;
type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;

export interface ThreadListItem {
  id: string;
  title: string;
  pinned: boolean;
  locked: boolean;
  createdAt: Date;
  lastPostAt: Date;
  authorName: string;
  replyCount: number;
}

export interface PostListItem {
  id: string;
  contentMd: string;
  createdAt: Date;
  authorId: string;
  authorName: string;
  authorRole: string;
  attachments: { id: string; storedName: string; fileName: string; mimeType: string; sizeBytes: number }[];
}

function toThreadListItem(t: ThreadRow): ThreadListItem {
  return {
    id: t.id,
    title: t.title,
    pinned: t.pinned,
    locked: t.locked,
    createdAt: t.createdAt,
    lastPostAt: t.lastPostAt,
    authorName: t.author.username,
    replyCount: Math.max(0, t._count.posts - 1),
  };
}

function toPostListItem(p: PostRow): PostListItem {
  return {
    id: p.id,
    contentMd: p.contentMd,
    createdAt: p.createdAt,
    authorId: p.authorId,
    authorName: p.author.username,
    authorRole: p.author.role,
    attachments: p.attachments.map((a) => ({
      id: a.id,
      storedName: a.storedName,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
  };
}

/**
 * 版块主题列表:固定条件 + 游标条件,永远走 (boardId, lastPostAt) 索引,
 * 不用 OFFSET——数据量大了以后 OFFSET 会越翻越慢。
 */
export async function listThreads(boardId: string, cursor: Cursor | null, pageSize = 20) {
  const rows = await db.thread.findMany({
    where: {
      boardId,
      pinned: false,
      ...(cursor
        ? {
            OR: [
              { lastPostAt: { lt: new Date(cursor.t) } },
              { lastPostAt: new Date(cursor.t), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastPostAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    include: threadInclude,
  });

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  const nextCursor: string | null =
    hasMore && last
      ? encodeCursor({ t: last.lastPostAt.toISOString(), id: last.id })
      : null;

  // 置顶帖数量少,单独一小查询,不参与游标
  const pinned = cursor
    ? []
    : (
        await db.thread.findMany({
          where: { boardId, pinned: true },
          orderBy: { lastPostAt: "desc" },
          take: 20,
          include: threadInclude,
        })
      ).map(toThreadListItem);

  return { pinned, items: items.map(toThreadListItem), nextCursor };
}

// —— 搜索 ——

export interface ThreadSearchItem extends ThreadListItem {
  boardSlug: string;
  boardName: string;
}

export interface PostSearchItem {
  id: string;
  threadId: string;
  threadTitle: string;
  boardSlug: string;
  boardName: string;
  /** 命中关键词附近的纯文本摘录,由服务端截好 */
  excerpt: string;
  createdAt: Date;
  authorName: string;
  authorRole: string;
}

/**
 * 主题搜索:标题 + 首帖正文,游标走 (lastPostAt, id) 复合排序,
 * 限定版块时仍可命中 (boardId, lastPostAt) 索引,不用 OFFSET。
 */
export async function searchThreads(
  q: string,
  boardId: string | undefined,
  cursor: Cursor | null,
  pageSize = 20,
) {
  const rows = await db.thread.findMany({
    where: {
      ...(boardId ? { boardId } : {}),
      AND: [
        {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            {
              posts: {
                some: { contentMd: { contains: q, mode: "insensitive" } },
              },
            },
          ],
        },
        ...(cursor
          ? [
              {
                OR: [
                  { lastPostAt: { lt: new Date(cursor.t) } },
                  { lastPostAt: new Date(cursor.t), id: { lt: cursor.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ lastPostAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    include: {
      ...threadInclude,
      board: { select: { slug: true, name: true } },
    },
  });

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  const nextCursor: string | null =
    hasMore && last
      ? encodeCursor({ t: last.lastPostAt.toISOString(), id: last.id })
      : null;

  return {
    items: items.map((t) => ({
      ...toThreadListItem(t),
      boardSlug: t.board.slug,
      boardName: t.board.name,
    })),
    nextCursor,
  };
}

/**
 * 回复搜索:命中任意楼层正文,按 (createdAt, id) 倒序游标翻页。
 */
export async function searchPosts(
  q: string,
  boardId: string | undefined,
  cursor: Cursor | null,
  pageSize = 20,
) {
  const rows = await db.post.findMany({
    where: {
      contentMd: { contains: q, mode: "insensitive" },
      ...(boardId ? { thread: { boardId } } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.t) } },
              { createdAt: new Date(cursor.t), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    include: {
      author: { select: { username: true, role: true } },
      thread: {
        select: {
          id: true,
          title: true,
          board: { select: { slug: true, name: true } },
        },
      },
    },
  });

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  const nextCursor: string | null =
    hasMore && last
      ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
      : null;

  return {
    items: items.map((p) => ({
      id: p.id,
      threadId: p.thread.id,
      threadTitle: p.thread.title,
      boardSlug: p.thread.board.slug,
      boardName: p.thread.board.name,
      excerpt: makeExcerpt(p.contentMd, q),
      createdAt: p.createdAt,
      authorName: p.author.username,
      authorRole: p.author.role,
    })),
    nextCursor,
  };
}

export async function listPosts(threadId: string, cursor: Cursor | null, pageSize = 50) {
  const rows = await db.post.findMany({
    where: {
      threadId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { gt: new Date(cursor.t) } },
              { createdAt: new Date(cursor.t), id: { gt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: pageSize + 1,
    include: postInclude,
  });

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  const nextCursor: string | null =
    hasMore && last
      ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
      : null;

  return { items: items.map(toPostListItem), nextCursor };
}
