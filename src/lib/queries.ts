import { Prisma } from "@prisma/client";
import { db } from "./db";
import { decodeCursor, encodeCursor, type Cursor } from "./cursor";

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
