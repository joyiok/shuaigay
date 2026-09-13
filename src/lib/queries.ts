import { Prisma } from "@prisma/client";
import { db } from "./db";
import { decodeCursor, encodeCursor, type Cursor } from "./cursor";
import { makeExcerpt } from "./excerpt";

const threadInclude = {
  author: { select: { username: true, avatarUrl: true, customTitle: true } },
  _count: { select: { posts: true } },
} satisfies Prisma.ThreadInclude;

const postInclude = {
  author: { select: { username: true, role: true, avatarUrl: true, points: true, customTitle: true } },
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
  globalPinned: boolean;
  digested: boolean;
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
  authorCustomTitle?: string | null;
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
    globalPinned: (t as unknown as { globalPinned: boolean }).globalPinned ?? false,
    digested: (t as unknown as { digested: boolean }).digested ?? false,
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
    authorCustomTitle: (p.author as unknown as { customTitle?: string | null }).customTitle ?? null,
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
  // 定时发布：非 staff 仅可见已到点（publishAt 为空或过去）；staff 全见。
  // 置顶过期：pinnedUntil 过去视为普通帖（查询时惰性，不写回 DB，cron 可选清理）。
  const now = new Date();
  const publishCond = isStaff ? {} : { OR: [{ publishAt: null }, { publishAt: { lte: now } }] };
  const statusFilter = isStaff
    ? { status: { not: "deleted" } }
    : viewerId
      ? { OR: [{ status: "approved" }, { status: "pending", authorId: viewerId }] }
      : { status: "approved" };
  const statusCond = isStaff
    ? { status: { not: "deleted" } }
    : viewerId
      ? ({ OR: [{ status: "approved" }, { status: "pending", authorId: viewerId }] } as any)
      : { status: "approved" };
  const cursorCond = cursor
    ? {
        OR: [
          { lastPostAt: { lt: new Date(cursor.t) } },
          { lastPostAt: new Date(cursor.t), id: { lt: cursor.id } },
        ],
      }
    : {};
  // 置顶过期惰性清理：到点即脱钩，避免 cron 挂了置顶永不过期（失败静默，不阻塞列表）
  try {
    await db.thread.updateMany({
      where: { pinnedUntil: { lt: now }, OR: [{ pinned: true }, { globalPinned: true }] },
      data: { pinned: false, globalPinned: false, pinnedUntil: null },
    });
  } catch {}
  const baseCond: any = { boardId, pinned: false, globalPinned: false, ...categoryFilter, ...statusCond, ...publishCond };
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

  // 置顶区:版块置顶 + 全局置顶都收录(全局置顶是全站行为,自然也属于本版块)
  const pinOr = [{ pinned: true }, { globalPinned: true }];
  const pinnedWhere: any = isStaff
    ? { boardId, ...categoryFilter, ...publishCond, AND: [{ OR: pinOr }, { status: { not: "deleted" } }] }
    : viewerId
      ? { boardId, ...categoryFilter, ...publishCond, AND: [{ OR: pinOr }, { OR: [{ status: "approved" }, { status: "pending", authorId: viewerId }] }] }
      : { boardId, ...categoryFilter, ...publishCond, AND: [{ OR: pinOr }, { status: "approved" }] };
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
  const keyword = q.trim().slice(0, 100);
  if (!keyword) return { items: [], nextCursor: null as string | null };
  // LIKE 转义：% _ \ 按字面匹配，避免用户输入改写查询语义
  const escaped = keyword.replace(/[\\%_]/g, (m) => `\\${m}`);
  const like = `%${escaped}%`;
  try {
    // trigram 相关度 + 时间双排序：标题命中优先，内容命中随后；
    // ILIKE 走 Thread_title_trgm_idx / Post_contentMd_trgm_idx（见 forum_completion 迁移），
    // similarity 仅做排序不做过滤，中文短词也能召回。
    type Row = {
      id: string; title: string; pinned: boolean; globalPinned: boolean; digested: boolean;
      locked: boolean; views: number; createdAt: Date; lastPostAt: Date;
      authorName: string; authorAvatarUrl: string | null; replyCount: string | number;
      boardSlug: string; boardName: string; sim: number;
    };
    const params: unknown[] = [keyword, like];
    let idx = 3;
    let boardCond = `"b"."isHidden" = false`;
    if (boardId) { boardCond = `"t"."boardId" = $${idx}`; params.push(boardId); idx++; }
    let cursorCond = `TRUE`;
    if (cursor) {
      cursorCond = `("t"."lastPostAt" < $${idx} OR ("t"."lastPostAt" = $${idx} AND "t"."id" < $${idx + 1}))`;
      params.push(new Date(cursor.t), cursor.id); idx += 2;
    }
    const limitParam = `$${idx}`; params.push(pageSize + 1);
    const rows = await db.$queryRawUnsafe<Row[]>(
      `SELECT "t"."id", "t"."title", "t"."pinned", "t"."globalPinned", "t"."digested", "t"."locked", "t"."views",\n        "t"."createdAt", "t"."lastPostAt",\n        "u"."username" AS "authorName", "u"."avatarUrl" AS "authorAvatarUrl",\n        (SELECT COUNT(*) FROM "Post" "p2" WHERE "p2"."threadId" = "t"."id") - 1 AS "replyCount",\n        "b"."slug" AS "boardSlug", "b"."name" AS "boardName",\n        GREATEST(similarity("t"."title", $1), 0) AS "sim"\n      FROM "Thread" "t"\n      JOIN "Board" "b" ON "b"."id" = "t"."boardId"\n      JOIN "User" "u" ON "u"."id" = "t"."authorId"\n      WHERE "t"."status" = 'approved'\n        AND ("t"."publishAt" IS NULL OR "t"."publishAt" <= NOW())\n        AND ${boardCond}\n        AND ("t"."title" ILIKE $2 ESCAPE '\\'\n          OR EXISTS (SELECT 1 FROM "Post" "p" WHERE "p"."threadId" = "t"."id" AND "p"."status" = 'approved' AND "p"."contentMd" ILIKE $2 ESCAPE '\\''))\n        AND ${cursorCond}\n      ORDER BY "sim" DESC, "t"."lastPostAt" DESC, "t"."id" DESC\n      LIMIT ${limitParam}`,
      ...params,
    );
    const hasMore = rows.length > pageSize;
    const items = rows.slice(0, pageSize);
    const last = items[items.length - 1];
    const nextCursor: string | null = hasMore && last ? encodeCursor({ t: new Date(last.lastPostAt).toISOString(), id: last.id }) : null;
    return {
      items: items.map((t) => ({
        id: t.id, title: t.title, pinned: t.pinned, globalPinned: (t as unknown as { globalPinned: boolean }).globalPinned,
        digested: t.digested, locked: t.locked, views: Number(t.views ?? 0),
        createdAt: new Date(t.createdAt), lastPostAt: new Date(t.lastPostAt),
        authorName: t.authorName, authorAvatarUrl: t.authorAvatarUrl ?? null,
        replyCount: Math.max(0, Number(t.replyCount ?? 0)),
        boardSlug: t.boardSlug, boardName: t.boardName,
      })),
      nextCursor,
    };
  } catch {
    // pg_trgm 不可用时回退到 Prisma ILIKE（功能不变，只是无相关度排序）
  }
  const nowFallback = new Date();
  const rows = await db.thread.findMany({
    where: {
      status: "approved",
      OR: [{ publishAt: null }, { publishAt: { lte: nowFallback } }],
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
  const keyword = q.trim().slice(0, 100);
  if (!keyword) return { items: [], nextCursor: null as string | null };
  const escaped = keyword.replace(/[\\%_]/g, (m) => `\\${m}`);
  const like = `%${escaped}%`;
  try {
    type Row = {
      id: string; contentMd: string; createdAt: Date;
      threadId: string; threadTitle: string; boardSlug: string; boardName: string;
      authorName: string; authorRole: string; authorAvatarUrl: string | null; sim: number;
    };
    const params: unknown[] = [keyword, like];
    let idx = 3;
    let boardCond = `"b"."isHidden" = false`;
    if (boardId) { boardCond = `"t"."boardId" = $${idx}`; params.push(boardId); idx++; }
    let cursorCond = `TRUE`;
    if (cursor) {
      cursorCond = `("p"."createdAt" < $${idx} OR ("p"."createdAt" = $${idx} AND "p"."id" < $${idx + 1}))`;
      params.push(new Date(cursor.t), cursor.id); idx += 2;
    }
    const limitParam = `$${idx}`; params.push(pageSize + 1);
    const rows = await db.$queryRawUnsafe<Row[]>(
      `SELECT "p"."id", "p"."contentMd", "p"."createdAt",\n        "t"."id" AS "threadId", "t"."title" AS "threadTitle",\n        "b"."slug" AS "boardSlug", "b"."name" AS "boardName",\n        "u"."username" AS "authorName", "u"."role" AS "authorRole", "u"."avatarUrl" AS "authorAvatarUrl",\n        GREATEST(similarity("p"."contentMd", $1), 0) AS "sim"\n      FROM "Post" "p"\n      JOIN "Thread" "t" ON "t"."id" = "p"."threadId"\n      JOIN "Board" "b" ON "b"."id" = "t"."boardId"\n      JOIN "User" "u" ON "u"."id" = "p"."authorId"\n      WHERE "p"."status" = 'approved' AND "t"."status" = 'approved' AND ("t"."publishAt" IS NULL OR "t"."publishAt" <= NOW())\n        AND ${boardCond}\n        AND "p"."contentMd" ILIKE $2 ESCAPE '\\'\n        AND ${cursorCond}\n      ORDER BY "sim" DESC, "p"."createdAt" DESC, "p"."id" DESC\n      LIMIT ${limitParam}`,
      ...params,
    );
    const hasMore = rows.length > pageSize;
    const items = rows.slice(0, pageSize);
    const last = items[items.length - 1];
    const nextCursor: string | null = hasMore && last ? encodeCursor({ t: new Date(last.createdAt).toISOString(), id: last.id }) : null;
    return {
      items: items.map((p) => ({
        id: p.id, threadId: p.threadId, threadTitle: p.threadTitle,
        boardSlug: p.boardSlug, boardName: p.boardName,
        excerpt: makeExcerpt(p.contentMd, keyword),
        createdAt: new Date(p.createdAt),
        authorName: p.authorName, authorRole: p.authorRole,
        authorAvatarUrl: p.authorAvatarUrl ?? null,
      })),
      nextCursor,
    };
  } catch {
    // 回退 Prisma
  }
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
  const nowAll = new Date();
  try {
    await db.thread.updateMany({
      where: { pinnedUntil: { lt: nowAll }, OR: [{ pinned: true }, { globalPinned: true }] },
      data: { pinned: false, globalPinned: false, pinnedUntil: null },
    });
  } catch {}
  const rows = await db.thread.findMany({
    where: {
      globalPinned: false,
      status: "approved",
      OR: [{ publishAt: null }, { publishAt: { lte: nowAll } }],
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
          where: { globalPinned: true, status: "approved", OR: [{ publishAt: null }, { publishAt: { lte: nowAll } }], board: { isHidden: false } },
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

/**
 * 小说跳章用：算出「从第 chapter 章所在那一页开始」需要的 cursor。
 * 分页是升序 50 章/页，cursor 语义是「从该条之后继续」，所以取上一页最后一条。
 * 第 1 页返回 null（直接默认地址）。
 */
export async function chapterPageCursor(
  threadId: string,
  authorId: string,
  chapter: number,
  pageSize = 50,
): Promise<string | null> {
  const index = Math.max(1, Math.floor(chapter));
  const pageStart = Math.floor((index - 1) / pageSize);
  if (pageStart === 0) return null;
  const prev = await db.post.findMany({
    where: { threadId, authorId, status: { not: "deleted" } },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    skip: pageStart * pageSize - 1,
    take: 1,
    select: { id: true, createdAt: true },
  });
  const row = prev[0];
  if (!row) return null;
  return encodeCursor({ t: row.createdAt.toISOString(), id: row.id });
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
  const statusCondPost: any = isStaff ? { status: { not: "deleted" } } : viewerId ? { OR: [{ status: "approved" }, { status: "pending", authorId: viewerId }] } : { status: "approved" };
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

/**
 * 楼层电梯：算出「第 floor 楼所在页」的 cursor（50 楼/页，升序）。
 * 第 1 页返回 null（默认地址即第 1 页）。越界返回 null。
 */
export async function floorPageCursor(
  threadId: string,
  floor: number,
  opts: { authorId?: string | null; viewerId?: string | null; isStaff?: boolean } = {},
  pageSize = 50,
): Promise<string | null> {
  const f = Math.floor(floor);
  if (!Number.isFinite(f) || f < 1) return null;
  const pageStart = Math.floor((f - 1) / pageSize);
  if (pageStart === 0) return null;
  const { authorId = null, viewerId = null, isStaff = false } = opts;
  const statusCond: unknown = isStaff
    ? { status: { not: "deleted" } }
    : viewerId
      ? { OR: [{ status: "approved" }, { status: "pending", authorId: viewerId }] }
      : { status: "approved" };
  const prev = await db.post.findMany({
    where: { threadId, ...(authorId ? { authorId } : {}), ...(statusCond as object) },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    skip: pageStart * pageSize - 1,
    take: 1,
    select: { id: true, createdAt: true },
  });
  const row = prev[0];
  if (!row) return null;
  return encodeCursor({ t: row.createdAt.toISOString(), id: row.id });
}
