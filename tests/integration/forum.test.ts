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

  it("封禁生命周期:临时/永久封禁、生效中查询、解封与过期自动失效", async () => {
    const b = await import("@/lib/ban");
    const user = await db!.user.create({
      data: {
        email: `b@${suffix}.test`,
        username: `b_${suffix}`,
        passwordHash: "x",
      },
    });

    // 初始未封
    expect((await b.isUserBanned(user.id)).banned).toBe(false);

    // 临时封禁 1 小时
    await b.banUser(user.id, "测试封禁", 1);
    expect((await b.isUserBanned(user.id)).banned).toBe(true);

    // 叠加永久封禁后,以最新(永久)为准
    await b.banUser(user.id, "叠加永久", null);
    const stacked = await b.isUserBanned(user.id);
    expect(stacked.banned).toBe(true);
    expect(stacked.ban?.expiresAt).toBeNull();

    // listActiveBans 只返回每条链上最新且生效中的封禁
    const map = await b.listActiveBans([user.id]);
    expect(map.get(user.id)?.reason).toBe("叠加永久");

    // 解封 = 把生效中的封禁置为过期,留档可查
    await b.unbanUser(user.id);
    expect((await b.isUserBanned(user.id)).banned).toBe(false);

    // 已过期的旧记录不视为封禁
    const past = new Date(Date.now() - 60_000);
    await db!.ban.create({ data: { userId: user.id, reason: "过期", expiresAt: past } });
    expect((await b.isUserBanned(user.id)).banned).toBe(false);

    await db!.ban.deleteMany({ where: { userId: user.id } });
  });

  it("通知收件箱:创建 → 未读计数 → 单条已读 → 全部已读", async () => {
    const user = await db!.user.create({
      data: {
        email: `n@${suffix}.test`,
        username: `ntf${suffix}`.slice(0, 20),
        passwordHash: "x",
      },
    });
    await db!.notification.createMany({
      data: [
        { userId: user.id, type: "reply", title: "有人回复了你", link: "/t/1" },
        { userId: user.id, type: "mention", title: "有人@了你", body: "hi" },
      ],
    });
    expect(
      await db!.notification.count({ where: { userId: user.id, read: false } }),
    ).toBe(2);

    const first = await db!.notification.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    await db!.notification.updateMany({
      where: { id: first!.id, userId: user.id },
      data: { read: true },
    });
    expect(
      await db!.notification.count({ where: { userId: user.id, read: false } }),
    ).toBe(1);

    await db!.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    expect(
      await db!.notification.count({ where: { userId: user.id, read: false } }),
    ).toBe(0);
    // 用户删除级联清通知，靠 afterEach 邮件后缀清理
  });
});
