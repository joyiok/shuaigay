import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

// 未配置 DATABASE_URL 时跳过；配置了但连不上时 2s 内快速失败
const shouldRun = Boolean(process.env.DATABASE_URL);

describe.skipIf(!shouldRun)("小说导入(需要数据库)", () => {
  let db: (typeof import("@/lib/db"))["db"] | undefined;
  let importNovel: (typeof import("@/lib/novel-import"))["importNovel"];
  let getNovelChapters: (typeof import("@/lib/novel-import"))["getNovelChapters"];
  let suffix: string;

  beforeEach(async () => {
    const [dbMod, mod] = await Promise.all([import("@/lib/db"), import("@/lib/novel-import")]);
    db = dbMod.db;
    importNovel = mod.importNovel;
    getNovelChapters = mod.getNovelChapters;
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("DB 连接超时(2s)")), 2000)),
    ]).catch((e) => {
      throw new Error(`集成测试无法连接数据库: ${String(e)}`);
    });
    suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  });

  afterEach(async () => {
    if (!db || !suffix) return;
    await db.board.deleteMany({ where: { slug: { startsWith: `test-${suffix}` } } }).catch(() => {});
    await db.user.deleteMany({ where: { email: { endsWith: `@${suffix}.test` } } }).catch(() => {});
  });

  afterAll(async () => {
    try {
      await db?.$disconnect();
    } catch {}
    try {
      const { getRedis } = await import("@/lib/redis");
      getRedis()?.disconnect();
    } catch {}
  });

  it("新建作品 → 按章导入 → 追加章节：顺序、序号与来源留痕都正确", async () => {
    const board = await db!.board.create({ data: { slug: `test-${suffix}`, name: "测试小说版" } });
    const user = await db!.user.create({
      data: { email: `novelist@${suffix}.test`, username: `nv${suffix}`.slice(0, 20), passwordHash: "x" },
    });

    const created = await importNovel({
      boardSlug: board.slug,
      title: "测试作品：雨夜",
      authorUsername: user.username,
      source: "作者投稿",
      license: "CC BY-NC 4.0",
      chapters: [
        { contentMd: "第一章 雨夜\n\n雨下了一整夜。" },
        { contentMd: "第二章 相遇\n\n她在便利店门口停下。" },
        { contentMd: "第三章 告白\n\n他终于说出口。" },
      ],
    });
    expect(created.ok).toBe(true);
    expect(created.created).toBe(3);
    expect(created.chapterCount).toBe(3);
    expect(created.firstChapterIndex).toBe(1);
    expect(created.threadUrl).toContain(created.threadId!);

    const first = await getNovelChapters(created.threadId!, 10);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.total).toBe(3);
    expect(first.chapters.map((c) => c.title)).toEqual(["第一章 雨夜", "第二章 相遇", "第三章 告白"]);
    expect(first.author).toBe(user.username);

    // 首章末尾附来源/授权留痕
    const op = await db!.post.findFirst({ where: { threadId: created.threadId }, orderBy: { createdAt: "asc" } });
    expect(op?.contentMd).toContain("来源：作者投稿");
    expect(op?.contentMd).toContain("授权：CC BY-NC 4.0");

    // 追加一章：章节作者仍是原主题作者，序号接着排
    const appended = await importNovel({ threadId: created.threadId, chapters: [{ contentMd: "第四章 离别\n\n车站的风很大。" }] });
    expect(appended.ok).toBe(true);
    expect(appended.created).toBe(1);
    expect(appended.chapterCount).toBe(4);
    expect(appended.firstChapterIndex).toBe(4);

    const all = await getNovelChapters(created.threadId!, 10);
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.chapters.map((c) => c.index)).toEqual([1, 2, 3, 4]);
    expect(all.chapters[3]!.title).toBe("第四章 离别");
  });

  it("参数与目标校验：缺 title / 版块不存在 / 主题不存在都返回可读错误", async () => {
    expect((await importNovel({ chapters: [] })).ok).toBe(false);
    const noTitle = await importNovel({ boardSlug: "no-such-board", chapters: [{ contentMd: "x" }] });
    expect(noTitle.ok).toBe(false);
    expect(noTitle.error).toContain("title");
    const noBoard = await importNovel({ boardSlug: "no-such-board", title: "测试作品标题", chapters: [{ contentMd: "x" }] });
    expect(noBoard.ok).toBe(false);
    expect(noBoard.error).toContain("不存在");
    const noThread = await importNovel({ threadId: "no-such-thread", chapters: [{ contentMd: "x" }] });
    expect(noThread.ok).toBe(false);
    expect(noThread.error).toContain("主题不存在");
  });
});
