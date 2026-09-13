import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { doCheckIn } from "@/lib/checkin";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { checkIn: { findUnique: mocks.findUnique }, $transaction: mocks.transaction } }));
vi.mock("@/lib/points", () => ({ applyPoints: vi.fn() }));
vi.mock("@/lib/points-config", () => ({ getPointsConfig: async () => ({ checkinBase: 5, checkinStreak: 10 }) }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue(null);
});

it("成功返回实际奖励；重复签到不再写入", async () => {
  mocks.transaction.mockResolvedValue(undefined);
  await expect(doCheckIn("user")).resolves.toEqual({ ok: true, points: 5, streak: 1 });
  mocks.findUnique.mockResolvedValue({ id: "existing" });
  await expect(doCheckIn("user")).resolves.toEqual({ ok: false, error: "今天已经签过了" });
  expect(mocks.transaction).toHaveBeenCalledTimes(1);
});

it("只有唯一键冲突视为重复签到，数据库故障交由界面提示重试", async () => {
  mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" }));
  await expect(doCheckIn("user")).resolves.toEqual({ ok: false, error: "今天已经签过了" });
  mocks.transaction.mockRejectedValue(new Error("database unavailable"));
  await expect(doCheckIn("user")).rejects.toThrow("database unavailable");
  mocks.findUnique.mockRejectedValue(new Error("read failed"));
  await expect(doCheckIn("user")).rejects.toThrow("read failed");
});
