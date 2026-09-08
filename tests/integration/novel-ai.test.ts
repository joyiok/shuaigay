import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const shouldRun = Boolean(process.env.DATABASE_URL);

describe.skipIf(!shouldRun)("AI 小说生成(需要数据库 + 本地 mock 模型)", () => {
  let db: (typeof import("@/lib/db"))["db"] | undefined;
  let generateNovelChapter: (typeof import("@/lib/novel-ai"))["generateNovelChapter"];
  let server: Server | undefined;
  let baseUrl = "";
  let lastBody = "";
  let suffix: string;
  let prevSettings: { aiBaseUrl: string; aiModel: string; aiProviderApiKeyEncrypted: string | null } | null = null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        lastBody = raw;
        const payload = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "测试作品：雨夜",
                  chapterTitle: "第 2 章 雨夜重逢",
                  contentMd: "# 第 2 章 雨夜重逢\n\n雨又下了起来，他在便利店门口停住。",
                }),
              },
            },
          ],
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
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
      getRedis()?.disconnect();
    } catch {}
  });

  beforeEach(async () => {
    const [dbMod, mod] = await Promise.all([import("@/lib/db"), import("@/lib/novel-ai")]);
    db = dbMod.db;
    generateNovelChapter = mod.generateNovelChapter;
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("DB 连接超时(2s)")), 2000)),
    ]).catch((e) => {
      throw new Error(`集成测试无法连接数据库: ${String(e)}`);
    });
    suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    // 把模型指到本地 mock；密钥走环境变量兜底（CI 没有 AI_SETTINGS_ENCRYPTION_KEY）
    prevSettings = await db.siteSetting.findUnique({ where: { id: "site" }, select: { aiBaseUrl: true, aiModel: true, aiProviderApiKeyEncrypted: true } });
    await db.siteSetting.upsert({
      where: { id: "site" },
      update: { aiBaseUrl: baseUrl, aiModel: "mock-model", aiProviderApiKeyEncrypted: null },
      create: { id: "site", aiBaseUrl: baseUrl, aiModel: "mock-model" },
    });
    process.env.AI_PROVIDER_API_KEY = "test-provider-key";
    lastBody = "";
  });

  afterEach(async () => {
    delete process.env.AI_PROVIDER_API_KEY;
    if (db && prevSettings) {
      await db.siteSetting
        .update({
          where: { id: "site" },
          data: { aiBaseUrl: prevSettings.aiBaseUrl, aiModel: prevSettings.aiModel, aiProviderApiKeyEncrypted: prevSettings.aiProviderApiKeyEncrypted },
        })
        .catch(() => {});
    }
    if (!db || !suffix) return;
    await db.board.deleteMany({ where: { slug: { startsWith: `test-${suffix}` } } }).catch(() => {});
    await db.user.deleteMany({ where: { email: { endsWith: `@${suffix}.test` } } }).catch(() => {});
  });

  it("续写：读取前情 → 生成章节 → 落库成下一章", async () => {
    const board = await db!.board.create({ data: { slug: `test-${suffix}`, name: "测试小说版" } });
    const user = await db!.user.create({
      data: { email: `ai@${suffix}.test`, username: `ai${suffix}`.slice(0, 20), passwordHash: "x" },
    });
    const thread = await db!.thread.create({
      data: { boardId: board.id, authorId: user.id, title: "AI 续写测试", status: "approved" },
    });
    await db!.post.create({
      data: { threadId: thread.id, authorId: user.id, contentMd: "第一章 初见\n\n他们在雨里第一次说话。", status: "approved" },
    });

    const result = await generateNovelChapter({ threadId: thread.id, import: true, words: 500, style: "都市", tone: "温暖" });
    expect(result.ok).toBe(true);
    expect(result.imported).toBe(true);
    expect(result.chapterCount).toBe(2);

    // 落库：第二章已写入，目录标题取正文首行
    const posts = await db!.post.findMany({ where: { threadId: thread.id, authorId: user.id }, orderBy: { createdAt: "asc" } });
    expect(posts).toHaveLength(2);
    expect(posts[1]!.contentMd).toContain("雨又下了起来");

    // prompt 里带上了前情与红线约束
    expect(lastBody).toContain("前情提要");
    expect(lastBody).toContain("他们在雨里第一次说话");
    expect(lastBody).toContain("禁止任何未成年人的恋爱或性内容");
  });

  it("新建：premise 进 prompt；import=false 只生成不落库", async () => {
    const before = await db!.thread.count();
    const result = await generateNovelChapter({ premise: "一个男生在雨夜捡到一只猫，认识了楼下邻居", import: false, words: 600 });
    expect(result.ok).toBe(true);
    expect(result.imported).toBe(false);
    expect(result.contentMd).toContain("雨又下了起来");
    expect(lastBody).toContain("一个男生在雨夜捡到一只猫");
    expect(await db!.thread.count()).toBe(before);
  });

  it("没配模型密钥时给出可读错误", async () => {
    delete process.env.AI_PROVIDER_API_KEY;
    await db!.siteSetting.update({ where: { id: "site" }, data: { aiProviderApiKeyEncrypted: null } });
    const result = await generateNovelChapter({ premise: "测试设定内容不少于十个字", import: false });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("模型服务密钥未配置");
  });
});
