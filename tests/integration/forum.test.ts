import bcrypt from "bcryptjs";
import { decodeCursor } from "@/lib/cursor";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

// 未配置 DATABASE_URL 时直接跳过集成测试；配置了但连不上时 2s 内快速失败，避免卡死整个 vitest
const shouldRun = Boolean(process.env.DATABASE_URL);

describe.skipIf(!shouldRun)("论坛数据层(需要数据库)", () => {
  let db: (typeof import("@/lib/db"))["db"] | undefined;
  let listThreads: (typeof import("@/lib/queries"))["listThreads"];
  let suffix: string;

  beforeEach(async () => {
    const [dbMod, queriesMod] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/queries"),
    ]);
    db = dbMod.db;
    listThreads = queriesMod.listThreads;
    // 2s 内连不上直接抛错让用例失败而不是卡住 hookTimeout 30s
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("DB 连接超时(2s)，请检查 DATABASE_URL 或 docker compose")), 2000),
      ),
    ]).catch((e) => {
      throw new Error(`集成测试无法连接数据库，已快速失败避免卡死: ${String(e)}`);
    });
    suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  });

  afterEach(async () => {
    if (!db || !suffix) return;
    // 清理本轮产生的测试数据，失败也不影响后续用例
    await db.board
      .deleteMany({ where: { slug: { startsWith: `test-${suffix}` } } })
      .catch(() => {});
    await db.user
      .deleteMany({ where: { email: { endsWith: `@${suffix}.test` } } })
      .catch(() => {});
  });

  afterAll(async () => {
    // 防止 Prisma/Redis 句柄让 vitest 进程卡住不退出
    try {
      await db?.$disconnect();
    } catch {}
    try {
      const { getRedis } = await import("@/lib/redis");
      const r = getRedis();
      if (r) {
        r.disconnect();
      }
    } catch {}
  });

  it("用户 → 主题 → 回复 全链路,删主题级联删帖", async () => {
    const user = await db!.user.create({
      data: {
        email: `a@${suffix}.test`,
        username: `u_${suffix}`,
        passwordHash: await bcrypt.hash("password123", 4),
      },
    });
    const board = await db!.board.create({
      data: { slug: `test-${suffix}`, name: "测试版块" },
    });
    const thread = await db!.thread.create({
      data: {
        boardId: board.id,
        authorId: user.id,
        title: "测试主题",
        posts: { create: { authorId: user.id, contentMd: "第一帖" } },
      },
    });

    await db!.post.create({
      data: { threadId: thread.id, authorId: user.id, contentMd: "回复" },
    });
    expect(await db!.post.count({ where: { threadId: thread.id } })).toBe(2);

    await db!.thread.delete({ where: { id: thread.id } });
    expect(await db!.post.count({ where: { threadId: thread.id } })).toBe(0);
  });

  it("主题列表游标分页:不重不漏,按 lastPostAt 倒序,不走 OFFSET", async () => {
    const user = await db!.user.create({
      data: {
        email: `p@${suffix}.test`,
        username: `p_${suffix}`,
        passwordHash: "x",
      },
    });
    const board = await db!.board.create({
      data: { slug: `test-${suffix}`, name: "分页" },
    });

    const base = Date.now();
    for (let i = 0; i < 25; i++) {
      await db!.thread.create({
        data: {
          boardId: board.id,
          authorId: user.id,
          title: `t${i}`,
          lastPostAt: new Date(base - i * 60_000),
        },
      });
    }

    const page1 = await listThreads(board.id, null, 20);
    expect(page1.items).toHaveLength(20);
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.items[0]!.title).toBe("t0");

    const page2 = await listThreads(board.id, decodeCursor(page1.nextCursor), 20);
    expect(page2.items).toHaveLength(5);
    expect(page2.nextCursor).toBeNull();
    expect(page2.items[0]!.title).toBe("t20");

    const seen = new Set([...page1.items, ...page2.items].map((t) => t.id));
    expect(seen.size).toBe(25);
  });
});
