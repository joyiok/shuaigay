import { unstable_cache } from "next/cache";
import { db } from "./db";

/**
 * 布局侧边栏 & 顶部导航的可缓存查询（60s）。
 * - 板块列表、统计、热帖、活跃用户都走 unstable_cache，避免每个请求打 5 次 DB。
 * - 在线人数、未读私信、私信计数等实时数据不缓存。
 * - 构建阶段（无 DB）会 catch 走兜底空数组，保证 sitemap/build 不崩。
 */

export const getCachedBoards = unstable_cache(
  async () => {
    try {
      return await db.board.findMany({
        where: { isHidden: false },
        orderBy: { order: "asc" },
        include: { _count: { select: { threads: true } } },
        take: 8,
      });
    } catch {
      return [] as Awaited<ReturnType<typeof db.board.findMany>>;
    }
  },
  ["sg:boards"],
  { revalidate: 60, tags: ["boards"] },
);

export const getCachedStats = unstable_cache(
  async () => {
    try {
      const [userCount, threadCount, postCount] = await Promise.all([
        db.user.count(),
        db.thread.count(),
        db.post.count(),
      ]);
      return { userCount, threadCount, postCount };
    } catch {
      return { userCount: 0, threadCount: 0, postCount: 0 };
    }
  },
  ["sg:stats"],
  { revalidate: 60, tags: ["stats"] },
);

export const getCachedHotTopics = unstable_cache(
  async () => {
    try {
      return await db.thread.findMany({
        where: { board: { isHidden: false } },
        orderBy: { lastPostAt: "desc" },
        take: 5,
        select: { id: true, title: true, board: { select: { name: true } }, _count: { select: { posts: true } } },
      });
    } catch {
      return [] as never[];
    }
  },
  ["sg:hotTopics"],
  { revalidate: 60, tags: ["threads"] },
);

export const getCachedActiveUsers = unstable_cache(
  async () => {
    try {
      return await db.user.findMany({
        orderBy: { threads: { _count: "desc" } },
        take: 5,
        select: { username: true, avatarUrl: true },
      });
    } catch {
      return [] as never[];
    }
  },
  ["sg:activeUsers"],
  { revalidate: 60, tags: ["users"] },
);
