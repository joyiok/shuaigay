import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const shouldRun = Boolean(process.env.DATABASE_URL);

describe.skipIf(!shouldRun)("自动追更(需要数据库 + 本地 mock 模型)", () => {
  let db: (typeof import("@/lib/db"))["db"] | undefined;
  let runNovelAuto: (typeof import("@/lib/novel-auto"))["runNovelAuto"];
  let server: Server | undefined;
  let baseUrl = "";
  let suffix: string;
  let seq = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const isContinue = (JSON.parse(raw || "{}").messages?.at(-1)?.content ?? "").includes("续写");
        const title = isContinue ? "第 2 章 自动续写" : "第 1 章 开篇";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: "自动追更测试书", chapterTitle: title, contentMd: `# ${title}\n\n自动生成的正文。` }) } }] }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const addr = server!.address();
    if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    try {
      await db?.$disconnect();
    } catch {}
    try {
      const { getRedis } = await import("@/lib/redis");
      const r = getRedis();
      await r?.del("novel-auto:lock").catch(() => {});
      r?.disconnect();
    } catch {}
  });

  beforeEach(async () => {
    const [dbMod, mod] = await Promise.all([import("@/lib/db"), import("@/lib/novel-auto")]);
    db = dbMod.db;
    runNovelAuto = mod.runNovelAuto;
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("DB 连接超时(2s)")), 2000)),
    ]).catch((e) => {
      throw new Error(`集成测试无法连接数据库: ${String(e)}`);
    });
    suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    process.env.AI_WRITER_API_KEY = "test-provider-key";
    await db.writerSetting.upsert({
      where: { id: "writer" },
      update: {
        enabled: true,
        baseUrl,
        model: "mock-model",
        apiKeyEncrypted: null,
        autoContinueEnabled: true,
        autoContinueIntervalHours: 6,
        autoContinueMaxPerRun: 1,
        autoContinueDailyCap: 20,
        autoContinueStatus: "pending",
      },
      create: {
        id: "writer",
        enabled: true,
        baseUrl,
        model: "mock-model",
        autoContinueEnabled: true,
        autoContinueIntervalHours: 6,
        autoContinueMaxPerRun: 1,
        autoContinueDailyCap: 20,
        autoContinueStatus: "pending",
      },
    });
    // 每日上限按 AuditLog 计数：清掉历史计数，保证用例确定性
    await db.auditLog.deleteMany({ where: { action: "novel_auto" } }).catch(() => {});
    const { getRedis } = await import("@/lib/redis");
    await getRedis()?.del("novel-auto:lock").catch(() => {});
  });

  afterEach(async () => {
    delete process.env.AI_WRITER_API_KEY;
    if (!db || !suffix) return;
    await db.thread.deleteMany({ where: { title: { startsWith: `自动追更-${suffix}` } } }).catch(() => {});
    await db.user.deleteMany({ where: { email: { endsWith: `@${suffix}.test` } } }).catch(() => {});
    await db.writerSetting.deleteMany({ where: { id: "writer" } }).catch(() => {});
  });

  async function makeThread(title: string, opts: { autoContinue: boolean; hoursAgo: number }) {
    const board = await db!.board.findUniqueOrThrow({ where: { slug: "novel" } });
    const n = ++seq;
    const user = await db!.user.create({
      data: { email: `auto${suffix}${n}@${suffix}.test`, username: `au${suffix}${n}`.slice(0, 20), passwordHash: "x" },
    });
    const past = new Date(Date.now() - opts.hoursAgo * 3_600_000);
    const thread = await db!.thread.create({
      data: { boardId: board.id, authorId: user.id, title, status: "approved", autoContinue: opts.autoContinue, createdAt: past, lastPostAt: past },
    });
    await db!.post.create({ data: { threadId: thread.id, authorId: user.id, contentMd: "第 1 章 开篇\n\n正文。", status: "approved", createdAt: past } });
    return thread;
  }

  it("只挑到期的自动追更作品，续写一章并进待审", async () => {
    const due = await makeThread(`自动追更-${suffix}-到期`, { autoContinue: true, hoursAgo: 8 });
    const manual = await makeThread(`自动追更-${suffix}-未开启`, { autoContinue: false, hoursAgo: 8 });
    const fresh = await makeThread(`自动追更-${suffix}-刚更新`, { autoContinue: true, hoursAgo: 1 });
    const finished = await makeThread(`自动追更-${suffix}-完结`, { autoContinue: true, hoursAgo: 48 });

    const result = await runNovelAuto();
    expect(result.status).toBe("ok");
    expect(result.generated).toBe(1);
    expect(result.results[0]?.threadId).toBe(due.id);

    // 到期作品多了一章，且是待审
    const duePosts = await db!.post.findMany({ where: { threadId: due.id }, orderBy: { createdAt: "asc" } });
    expect(duePosts).toHaveLength(2);
    expect(duePosts[1]!.status).toBe("pending");
    expect(duePosts[1]!.contentMd).toContain("自动生成的正文");

    // 未开启 / 刚更新 / 已完结 都不动
    expect(await db!.post.count({ where: { threadId: manual.id } })).toBe(1);
    expect(await db!.post.count({ where: { threadId: fresh.id } })).toBe(1);
    expect(await db!.post.count({ where: { threadId: finished.id } })).toBe(1);

    // 审计留痕
    expect(await db!.auditLog.count({ where: { action: "novel_auto", targetId: due.id } })).toBe(1);
  });

  it("每日上限用尽时不再生成", async () => {
    const due = await makeThread(`自动追更-${suffix}-上限`, { autoContinue: true, hoursAgo: 8 });
    const actor = await db!.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    await db!.auditLog.create({ data: { actorId: actor.id, action: "novel_auto", targetType: "thread", targetId: "seed", detail: "占位" } });
    await db!.writerSetting.update({ where: { id: "writer" }, data: { autoContinueDailyCap: 1 } });

    const result = await runNovelAuto();
    expect(result.status).toBe("capped");
    expect(result.generated).toBe(0);
    expect(await db!.post.count({ where: { threadId: due.id } })).toBe(1);
  });

  it("未开启自动追更时直接跳过", async () => {
    await makeThread(`自动追更-${suffix}-开关`, { autoContinue: true, hoursAgo: 8 });
    await db!.writerSetting.update({ where: { id: "writer" }, data: { autoContinueEnabled: false } });
    const result = await runNovelAuto();
    expect(result.status).toBe("disabled");
    expect(result.generated).toBe(0);
  });
});
