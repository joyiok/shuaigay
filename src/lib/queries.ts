import { Prisma } from "@prisma/client";
import { db } from "./db";
import { decodeCursor, encodeCursor, type Cursor } from "./cursor";
import { makeExcerpt } from "./excerpt";

const threadInclude = {
  author: { select: { username: true, avatarUrl: true } },
  _count: { select: { posts: true } },
} satisfies Prisma.ThreadInclude;

const postInclude = {
  author: { select: { username: true, role: true, avatarUrl: true, points: true } },
  attachments: true,
  edits: {
    orderBy: { createdAt: "desc" as const },
    take: 20,
    include: { editor: { select: { username: true } } },
  },
} satisfies Prisma.PostInclude;

type ThreadRow = Prisma.ThreadGetPayload<{ include: typeof threadInclude }>;
type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;

export interface ThreadListItem {
  id: string;
  title: string;
  pinned: boolean;
  locked: boolean;
  views: number;
  createdAt: Date;
  lastPostAt: Date;
  authorName: string;
  authorAvatarUrl: string | null;
  replyCount: number;
  categoryName?: string | null;
  status?: string;
}

export interface PostEditListItem {
  id: string;
  editorName: string;
  oldContentMd: string;
  newContentMd: string;
  createdAt: Date;
}

export interface PostRatingReason {
  username: string;
  value: number;
  reason: string;
  createdAt: Date;
}
export interface PostRatingView {
  up: number;
  down: number;
  mine: -1 | 0 | 1;
  reasons: PostRatingReason[];
}

export interface PostListItem {
  id: string;
  contentMd: string;
  createdAt: Date;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorPoints: number;
  authorAvatarUrl: string | null;
  attachments: { id: string; storedName: string; fileName: string; mimeType: string; sizeBytes: number }[];
  edits: PostEditListItem[];
  rating: PostRatingView;
  status?: string;
}

function toThreadListItem(t: ThreadRow): ThreadListItem {
  return {
    id: t.id,
    title: t.title,
    pinned: t.pinned,
    locked: t.locked,
    views: (t as unknown as { views: number }).views ?? 0,
    createdAt: t.createdAt,
    lastPostAt: t.lastPostAt,
    authorName: t.author.username,
    authorAvatarUrl: (t.author as unknown as { avatarUrl: string | null }).avatarUrl ?? null,
    replyCount: Math.max(0, t._count.posts - 1),
    status: (t as unknown as { status: string }).status ?? "approved",
  };
}

function toPostListItem(p: PostRow, rating: PostRatingView): PostListItem {
  return {
    id: p.id,
    contentMd: p.contentMd,
    createdAt: p.createdAt,
    authorId: p.authorId,
    authorName: p.author.username,
    authorRole: p.author.role,
    authorPoints: (p.author as unknown as { points: number }).points ?? 0,
    authorAvatarUrl: (p.author as unknown as { avatarUrl: string | null }).avatarUrl ?? null,
    status: (p as unknown as { status: string }).status ?? "approved",
    attachments: p.attachments.map((a) => ({
      id: a.id,
      storedName: a.storedName,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
    edits: p.edits.map((e) => ({
      id: e.id,
      editorName: e.editor.username,
      oldContentMd: e.oldContentMd,
      newContentMd: e.newContentMd,
      createdAt: e.createdAt,
    })),
    rating,
  };
}

/**
 * 版块主题列表:固定条件 + 游标条件,永远走 (boardId, lastPostAt) 索引,
 * 不用 OFFSET——数据量大了以后 OFFSET 会越翻越慢。
 */
export async function listThreads(
  boardId: string,
  cursor: Cursor | null,
  categoryId: string | number | null = null,
  viewerId: string | null = null,
  isStaff = false,
  pageSize = 20,
) {
  // 兼容旧调用 listThreads(boardId, cursor, 20) — 第三参为 number 时视为 pageSize
  if (typeof categoryId === "number") {
    pageSize = categoryId;
    categoryId = null;
  }
  const categoryFilter = categoryId ? { categoryId: String(categoryId) } : {};
  const statusFilter = isStaff
    ? {}
    : viewerId
      ? { OR: [{ status: "approved" }, { status: "pending", authorId: viewerId }] }
      : { status: "approved" };
  const statusCond = isStaff ? {} : viewerId ? { OR: [{ status: "approved" }, { status: "pending", authorId: viewerId }] } as any : { status: "approved" };
  const cursorCond = cursor
    ? {
        OR: [
          { lastPostAt: { lt: new Date(cursor.t) } },
          { lastPostAt: new Date(cursor.t), id: { lt: cursor.id } },
        ],
      }
    : {};
  const baseCond: any = { boardId, pinned: false, ...categoryFilter, ...statusCond };
  const whereCond: any = cursor ? { AND: [baseCond, cursorCond] } : baseCond;
  const rows = await db.thread.findMany({
    where: whereCond,
    orderBy: [{ lastPostAt: "desc" as const }, { id: "desc" as const }],
    take: pageSize + 1,
    include: { ...threadInclude, category: { select: { name: true } } },
  });

  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1] as unknown as { lastPostAt: Date; id: string };
  const nextCursor: string | null =
    hasMore && last
      ? encodeCursor({ t: last.lastPostAt.toISOString(), id: last.id })
      : null;

  const mapWithCat = (t: (typeof rows)[number]): ThreadListItem => ({
    ...toThreadListItem(t as unknown as ThreadRow),
    categoryName: (t as unknown as { category: { name: string } | null }).category?.name ?? null,
  });

  const pinnedWhere: any = isStaff ? { boardId, pinned: true, ...categoryFilter } : viewerId ? { boardId, pinned: true, ...categoryFilter, OR: [{ status: "approved" }, { status: "pending", authorId: viewerId }] } : { boardId, pinned: true, ...categoryFilter, status: "approved" };
  const pinned = cursor
    ? []
    : (
        await db.thread.findMany({
          where: pinnedWhere,
          orderBy: { lastPostAt: "desc" as const },
          take: 20,
          include: { ...threadInclude, category: { select: { name: true } } },
        })
      ).map((t) => ({
        ...toThreadListItem(t as unknown as ThreadRow),
        categoryName: (t as unknown as { category: { name: string } | null }).category?.name ?? null,
      }));

  return { pinned, items: items.map(mapWithCat), nextCursor };
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
  excerpt: string;
  createdAt: Date;
  authorName: string;
  authorRole: string;
  authorAvatarUrl: string | null;
}

export async function searchThreads(
  q: string,
  boardId: string | undefined,
  cursor: Cursor | null,
  pageSize = 20,
) {
  const rows = await db.thread.findMany({
    where: {
      status: "approved",
      ...(boardId ? { boardId } : { board: { isHidden: false } }),
      AND: [
        {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { posts: { some: { contentMd: { contains: q, mode: "insensitive" } } } },
          ],
        },
        ...(cursor
          ? [{ OR: [{ lastPostAt: { lt: new Date(cursor.t) } }, { lastPostAt: new Date(cursor.t), id: { lt: cursor.id } }] }]
          : []),
      ],
    },
    orderBy: [{ lastPostAt: "desc" as const }, { id: "desc" as const }],
    take: pageSize + 1,
    include: { ...threadInclude, board: { select: { slug: true, name: true } } },
  });
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  const nextCursor: string | null = hasMore && last ? encodeCursor({ t: last.lastPostAt.toISOString(), id: last.id }) : null;
  return {
    items: items.map((t) => ({ ...toThreadListItem(t), boardSlug: t.board.slug, boardName: t.board.name })),
    nextCursor,
  };
}

export async function searchPosts(
  q: string,
  boardId: string | undefined,
  cursor: Cursor | null,
  pageSize = 20,
) {
  const rows = await db.post.findMany({
    where: {
      contentMd: { contains: q, mode: "insensitive" },
      status: "approved",
      ...(boardId ? { thread: { boardId } } : { thread: { board: { isHidden: false } } }),
      ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.t) } }, { createdAt: new Date(cursor.t), id: { lt: cursor.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: pageSize + 1,
    include: {
      author: { select: { username: true, role: true, avatarUrl: true } },
      thread: { select: { id: true, title: true, board: { select: { slug: true, name: true } } } },
    },
  });
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  const nextCursor: string | null = hasMore && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null;
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
      authorAvatarUrl: (p.author as unknown as { avatarUrl: string | null }).avatarUrl ?? null,
    })),
    nextCursor,
  };
}

export async function listAllThreads(cursor: Cursor | null, pageSize = 20) {
  const rows = await db.thread.findMany({
    where: {
      pinned: false,
      status: "approved",
      board: { isHidden: false },
      ...(cursor ? { OR: [{ lastPostAt: { lt: new Date(cursor.t) } }, { lastPostAt: new Date(cursor.t), id: { lt: cursor.id } }] } : {}),
    },
    orderBy: [{ lastPostAt: "desc" as const }, { id: "desc" as const }],
    take: pageSize + 1,
    include: { ...threadInclude, board: { select: { slug: true, name: true } } },
  });
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1] as unknown as ThreadRow & { board: { slug: string; name: string } };
  const nextCursor: string | null = hasMore && last ? encodeCursor({ t: last.lastPostAt.toISOString(), id: last.id }) : null;
  const pinned = cursor
    ? []
    : (
        await db.thread.findMany({
          where: { pinned: true, status: "approved", board: { isHidden: false } },
          orderBy: { lastPostAt: "desc" as const },
          take: 20,
          include: { ...threadInclude, board: { select: { slug: true, name: true } } },
        })
      ).map((t) => ({
        ...toThreadListItem(t),
        boardSlug: (t as unknown as { board: { slug: string } }).board.slug,
        boardName: (t as unknown as { board: { name: string } }).board.name,
      }));
  return {
    pinned,
    items: items.map((t) => ({
      ...toThreadListItem(t),
      boardSlug: (t as unknown as { board: { slug: string } }).board.slug,
      boardName: (t as unknown as { board: { name: string } }).board.name,
    })),
    nextCursor,
  };
}

export async function listPosts(threadId: string, cursor: Cursor | null, viewerId: string | null = null, pageSizeOrStaff: number | boolean = 50, authorIdOrPageSize: string | number | null = null, maybeAuthorId: string | null = null) {
  // 兼容旧调用: listPosts(id, cursor, viewerId, 50, authorId) vs 新调用: listPosts(id, cursor, viewerId, isStaff, 50, authorId)
  let isStaff = false;
  let pageSize = 50;
  let authorId: string | null = null;
  if (typeof pageSizeOrStaff === "boolean") {
    isStaff = pageSizeOrStaff;
    pageSize = typeof authorIdOrPageSize === "number" ? authorIdOrPageSize : 50;
    authorId = typeof authorIdOrPageSize === "string" ? authorIdOrPageSize : maybeAuthorId;
  } else if (typeof pageSizeOrStaff === "number") {
    pageSize = pageSizeOrStaff;
    authorId = authorIdOrPageSize as string | null;
  }
  const statusCondPost: any = isStaff ? {} : viewerId ? { OR: [{ status: "approved" }, { status: "pending", authorId: viewerId }] } : { status: "approved" };
  const authorCond = authorId ? { authorId } : {};
  const cursorCondPost: any = cursor ? { OR: [{ createdAt: { gt: new Date(cursor.t) } }, { createdAt: new Date(cursor.t), id: { gt: cursor.id } }] } : {};
  const baseCondPost: any = { threadId, ...authorCond, ...statusCondPost };
  const wherePost: any = cursor ? { AND: [baseCondPost, cursorCondPost] } : baseCondPost;
  const rows = await db.post.findMany({
    where: wherePost,
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    take: pageSize + 1,
    include: postInclude,
  });
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  const nextCursor: string | null = hasMore && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null;

  const ids = items.map((p) => p.id);
  let upMap = new Map<string, number>();
  let downMap = new Map<string, number>();
  let mineMap = new Map<string, number>();
  let reasonsByPost = new Map<string, PostRatingReason[]>();

  if (ids.length) {
    const [grouped, mineRows, reasonRows] = await Promise.all([
      (db as unknown as { postRating: { groupBy: (a: unknown) => Promise<{ postId: string; value: number; _count: { _all: number } }[]> } }).postRating.groupBy({
        by: ["postId", "value"],
        where: { postId: { in: ids } },
        _count: { _all: true },
      }),
      viewerId
        ? (db as unknown as { postRating: { findMany: (a: unknown) => Promise<{ postId: string; value: number }[]> } }).postRating.findMany({
            where: { postId: { in: ids }, userId: viewerId },
            select: { postId: true, value: true },
          })
        : Promise.resolve([] as { postId: string; value: number }[]),
      (db as unknown as { postRating: { findMany: (a: unknown) => Promise<{ postId: string; value: number; reason: string | null; createdAt: Date; user: { username: string } }[]> } }).postRating.findMany({
        where: { postId: { in: ids }, reason: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 60,
        include: { user: { select: { username: true } } },
      }),
    ]);
    for (const g of grouped) {
      if (g.value === 1) upMap.set(g.postId, g._count._all);
      else if (g.value === -1) downMap.set(g.postId, g._count._all);
    }
    for (const r of mineRows) mineMap.set(r.postId, r.value);
    for (const r of reasonRows) {
      const list = reasonsByPost.get(r.postId) ?? [];
      if (list.length < 5) {
        list.push({ username: r.user.username, value: r.value, reason: r.reason ?? "", createdAt: r.createdAt });
        reasonsByPost.set(r.postId, list);
      }
    }
  }

  const mapped = items.map((p) =>
    toPostListItem(p as unknown as PostRow, {
      up: upMap.get(p.id) ?? 0,
      down: downMap.get(p.id) ?? 0,
      mine: (mineMap.get(p.id) === 1 ? 1 : mineMap.get(p.id) === -1 ? -1 : 0) as -1 | 0 | 1,
      reasons: reasonsByPost.get(p.id) ?? [],
    }),
  );
  return { items: mapped, nextCursor };
}
