import { afterEach, beforeEach, describe, expect, it } from "vitest";

// 未配置 DATABASE_URL 时直接跳过；CI / 本地 dev 库跑真实链路
const shouldRun = Boolean(process.env.DATABASE_URL);

describe.skipIf(!shouldRun)("积分台账(需要数据库)", () => {
  let db: (typeof import("@/lib/db"))["db"] | undefined;
  let points: typeof import("@/lib/points") | undefined;
  let moderation: typeof import("@/lib/moderation") | undefined;
  let suffix: string;
  const createdUserIds: string[] = [];
  const createdThreadIds: string[] = [];

  beforeEach(async () => {
    const [dbMod, pointsMod, moderationMod] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/points"),
      import("@/lib/moderation"),
    ]);
    db = dbMod.db;
    points = pointsMod;
    moderation = moderationMod;
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("DB 连接超时(2s)")), 2000),
      ),
    ]);
    suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  });

  afterEach(async () => {
    if (!db) return;
    for (const tid of createdThreadIds.splice(0)) {
      await db.thread.delete({ where: { id: tid } }).catch(() => {});
    }
    for (const uid of createdUserIds.splice(0)) {
      await db.user.delete({ where: { id: uid } }).catch(() => {});
    }
  });

  async function makeUser() {
    const u = await db!.user.create({
      data: {
        email: `pt_${suffix}_${createdUserIds.length}@test.dev`,
        username: `pt_${suffix}_${createdUserIds.length}`,
        passwordHash: "x",
      },
      select: { id: true, points: true },
    });
    createdUserIds.push(u.id);
    return u;
  }

  it("addPoints 原子记账：余额与流水一致", async () => {
    const u = await makeUser();
    const b1 = await points!.addPoints(u.id, 10, "thread_create", { refType: "thread", refId: "t_fake_1" });
    expect(b1).toBe(10);
    const b2 = await points!.addPoints(u.id, -3, "manual");
    expect(b2).toBe(7);
    const rows = await db!.pointTransaction.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((r) => [r.delta, r.balance, r.reason])).toEqual([
      [10, 10, "thread_create"],
      [-3, 7, "manual"],
    ]);
    expect(rows[0]!.refType).toBe("thread");
  });

  it("扣回只扣加过的、只扣一次；恢复补回对冲", async () => {
    const u = await makeUser();
    // 从未加分 → 不扣
    expect(await points!.clawbackIfAwarded(u.id, "thread", "t_never", 10)).toBe(false);
    await points!.addPoints(u.id, 10, "thread_create", { refType: "thread", refId: "t_fake_2" });
    // 有效删除 → 扣
    expect(await points!.clawbackIfAwarded(u.id, "thread", "t_fake_2", 10)).toBe(true);
    // 重复删 → 不重扣
    expect(await points!.clawbackIfAwarded(u.id, "thread", "t_fake_2", 10)).toBe(false);
    let me = await db!.user.findUnique({ where: { id: u.id }, select: { points: true } });
    expect(me!.points).toBe(0);
    // 恢复 → 补回一次；再恢复不重复
    expect(await points!.regrantIfClawed(u.id, "thread", "t_fake_2", 10)).toBe(true);
    expect(await points!.regrantIfClawed(u.id, "thread", "t_fake_2", 10)).toBe(false);
    me = await db!.user.findUnique({ where: { id: u.id }, select: { points: true } });
    expect(me!.points).toBe(10);
    // 删→恢复→删：第二次有效删除再扣一次
    expect(await points!.clawbackIfAwarded(u.id, "thread", "t_fake_2", 10)).toBe(true);
    me = await db!.user.findUnique({ where: { id: u.id }, select: { points: true } });
    expect(me!.points).toBe(0);
  });

  it("softDeleteThread/restore 走台账：加过才扣，恢复才补", async () => {
    const u = await makeUser();
    const board = await db!.board.findFirst({ select: { id: true } });
    expect(board).toBeTruthy();
    const t = await db!.thread.create({
      data: {
        boardId: board!.id,
        authorId: u.id,
        title: `台账测试主题 ${suffix}`,
        status: "approved",
        posts: { create: { authorId: u.id, contentMd: "正文", status: "approved" } },
      },
      select: { id: true },
    });
    createdThreadIds.push(t.id);
    // 模拟发帖加分（走真实 award 原因）
    await points!.addPoints(u.id, 10, "thread_create", { refType: "thread", refId: t.id });
    await moderation!.softDeleteThread(t.id, { actorId: u.id, reason: "测试删除" });
    let me = await db!.user.findUnique({ where: { id: u.id }, select: { points: true } });
    expect(me!.points).toBe(0);
    const claw = await db!.pointTransaction.findFirst({
      where: { userId: u.id, refId: t.id, reason: "delete_clawback" },
    });
    expect(claw).toBeTruthy();
    await moderation!.restoreFromTrash("thread", t.id);
    me = await db!.user.findUnique({ where: { id: u.id }, select: { points: true } });
    expect(me!.points).toBe(10);
  });

  it("pending 内容删除不扣分（从未加过）", async () => {
    const u = await makeUser();
    const board = await db!.board.findFirst({ select: { id: true } });
    const t = await db!.thread.create({
      data: {
        boardId: board!.id,
        authorId: u.id,
        title: `待审主题 ${suffix}`,
        status: "pending",
        posts: { create: { authorId: u.id, contentMd: "正文", status: "pending" } },
      },
      select: { id: true },
    });
    createdThreadIds.push(t.id);
    await moderation!.softDeleteThread(t.id, { actorId: u.id, reason: "测试" });
    const me = await db!.user.findUnique({ where: { id: u.id }, select: { points: true } });
    expect(me!.points).toBe(0);
    const txCount = await db!.pointTransaction.count({ where: { userId: u.id } });
    expect(txCount).toBe(0);
  });
});
