import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInviteCreate = vi.hoisted(() => vi.fn());
const mockInviteFindUnique = vi.hoisted(() => vi.fn());
const mockInviteUpdateMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    invite: {
      create: mockInviteCreate,
      findUnique: mockInviteFindUnique,
      updateMany: mockInviteUpdateMany,
    },
  },
}));

import { generateInviteCode, createInviteCode, consumeInvite, INVITE_CODES_PER_USER } from "@/lib/invite";

describe("generateInviteCode 生成", () => {
  it("返回 8 位十六进制字符串", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[a-f0-9]{8}$/);
    expect(code.length).toBe(8);
  });

  it("每次生成不同（随机性）", () => {
    const a = generateInviteCode();
    const b = generateInviteCode();
    // 极小概率碰撞，随机性保证不同
    expect(a).not.toBe(b);
  });

  it("批量生成 50 个均符合格式且去重率高", () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) set.add(generateInviteCode());
    expect(set.size).toBeGreaterThan(45);
    for (const c of set) expect(c).toMatch(/^[a-f0-9]{8}$/);
  });
});

describe("createInviteCode 原子创建 + 唯一冲突重试", () => {
  beforeEach(() => mockInviteCreate.mockReset());

  it("首次创建成功返回 true", async () => {
    mockInviteCreate.mockResolvedValue({ id: "1", code: "abc12345" });
    const ok = await createInviteCode("user1");
    expect(ok).toBe(true);
    expect(mockInviteCreate).toHaveBeenCalledTimes(1);
    expect(mockInviteCreate).toHaveBeenCalledWith({ data: { code: expect.stringMatching(/^[a-f0-9]{8}$/), inviterId: "user1" } });
  });

  it("撞一次唯一索引后重试成功", async () => {
    mockInviteCreate.mockRejectedValueOnce(new Error("Unique constraint")).mockResolvedValueOnce({ id: "2" });
    const ok = await createInviteCode("user1");
    expect(ok).toBe(true);
    expect(mockInviteCreate).toHaveBeenCalledTimes(2);
  });

  it("连续撞 5 次后返回 false", async () => {
    mockInviteCreate
      .mockRejectedValueOnce(new Error("Unique constraint"))
      .mockRejectedValueOnce(new Error("Unique constraint"))
      .mockRejectedValueOnce(new Error("Unique constraint"))
      .mockRejectedValueOnce(new Error("Unique constraint"))
      .mockRejectedValueOnce(new Error("Unique constraint"));
    const ok = await createInviteCode("user1");
    expect(ok).toBe(false);
    expect(mockInviteCreate).toHaveBeenCalledTimes(5);
  });

  it("前 4 次失败第 5 次成功仍返回 true", async () => {
    mockInviteCreate
      .mockRejectedValueOnce(new Error("dup"))
      .mockRejectedValueOnce(new Error("dup"))
      .mockRejectedValueOnce(new Error("dup"))
      .mockRejectedValueOnce(new Error("dup"))
      .mockResolvedValueOnce({ id: "5" });
    const ok = await createInviteCode("user1");
    expect(ok).toBe(true);
    expect(mockInviteCreate).toHaveBeenCalledTimes(5);
  });

  it("INVITE_CODES_PER_USER 常量为 5", () => {
    expect(INVITE_CODES_PER_USER).toBe(5);
  });
});

describe("consumeInvite 原子消耗", () => {
  beforeEach(() => {
    mockInviteFindUnique.mockReset();
    mockInviteUpdateMany.mockReset();
  });

  function txMock(overrides?: { findUnique?: any; updateMany?: any }) {
    return {
      invite: {
        findUnique: overrides?.findUnique ?? mockInviteFindUnique,
        updateMany: overrides?.updateMany ?? mockInviteUpdateMany,
      },
    } as any;
  }

  it("码不存在返回 null", async () => {
    mockInviteFindUnique.mockResolvedValue(null);
    const r = await consumeInvite(txMock(), "nope1234");
    expect(r).toBeNull();
    expect(mockInviteUpdateMany).not.toHaveBeenCalled();
  });

  it("未超额时原子 +1 成功返回 inviterId", async () => {
    mockInviteFindUnique.mockResolvedValue({ id: "inv1", inviterId: "owner1", code: "abc12345", maxUses: 5, usedCount: 2 });
    mockInviteUpdateMany.mockResolvedValue({ count: 1 });
    const r = await consumeInvite(txMock(), "abc12345");
    expect(r).toBe("owner1");
    expect(mockInviteUpdateMany).toHaveBeenCalledWith({
      where: { id: "inv1", usedCount: { lt: 5 } },
      data: { usedCount: { increment: 1 } },
    });
  });

  it("已用完（usedCount >= maxUses）返回 null，原子更新 count=0", async () => {
    mockInviteFindUnique.mockResolvedValue({ id: "inv1", inviterId: "owner1", code: "abc12345", maxUses: 2, usedCount: 2 });
    mockInviteUpdateMany.mockResolvedValue({ count: 0 });
    const r = await consumeInvite(txMock(), "abc12345");
    expect(r).toBeNull();
  });

  it("并发抢占：只有 lt 条件满足的才能成功，模拟第二人失败", async () => {
    // 第一人成功
    mockInviteFindUnique.mockResolvedValue({ id: "inv1", inviterId: "owner1", code: "abc12345", maxUses: 1, usedCount: 0 });
    mockInviteUpdateMany.mockResolvedValueOnce({ count: 1 });
    const r1 = await consumeInvite(txMock(), "abc12345");
    expect(r1).toBe("owner1");

    // 第二人同一时刻，usedCount 已被第一人占满，updateMany 返回 0
    mockInviteFindUnique.mockResolvedValue({ id: "inv1", inviterId: "owner1", code: "abc12345", maxUses: 1, usedCount: 1 });
    mockInviteUpdateMany.mockResolvedValueOnce({ count: 0 });
    const r2 = await consumeInvite(txMock(), "abc12345");
    expect(r2).toBeNull();
  });

  it("usedCount < maxUses 时 increment 语义正确，边界 0/5", async () => {
    mockInviteFindUnique.mockResolvedValue({ id: "inv1", inviterId: "owner1", code: "abc12345", maxUses: 5, usedCount: 4 });
    mockInviteUpdateMany.mockResolvedValue({ count: 1 });
    const r = await consumeInvite(txMock(), "abc12345");
    expect(r).toBe("owner1");
  });

  it("maxUses=5 时刚好用完的最后一次仍成功", async () => {
    mockInviteFindUnique.mockResolvedValue({ id: "inv1", inviterId: "owner1", code: "xxxx1111", maxUses: 5, usedCount: 4 });
    mockInviteUpdateMany.mockResolvedValue({ count: 1 });
    expect(await consumeInvite(txMock(), "xxxx1111")).toBe("owner1");
  });

  it("空码直接返回 null", async () => {
    mockInviteFindUnique.mockResolvedValue(null);
    expect(await consumeInvite(txMock(), "")).toBeNull();
  });
});
