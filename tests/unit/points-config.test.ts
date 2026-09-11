import { describe, expect, it } from "vitest";
import {
  DEFAULT_POINTS_CONFIG,
  pointsSettingsSchema,
} from "@/lib/points-config";
import { checkinPoints } from "@/lib/checkin";

describe("积分规则配置", () => {
  it("默认值与历史写死值一致", () => {
    expect(DEFAULT_POINTS_CONFIG).toEqual({
      thread: 10,
      reply: 3,
      invite: 10,
      checkinBase: 5,
      checkinStreak: 10,
      memberThreshold: 30,
    });
  });

  it("后台表单校验：合法通过", () => {
    const r = pointsSettingsSchema.safeParse({
      pointsThread: "20",
      pointsReply: "5",
      pointsInvite: "15",
      pointsCheckinBase: "8",
      pointsCheckinStreak: "20",
      pointsMemberThreshold: "50",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pointsThread).toBe(20);
      expect(r.data.pointsMemberThreshold).toBe(50);
    }
  });

  it("后台表单校验：负数/超限/非数字拒绝", () => {
    const base = {
      pointsThread: 10,
      pointsReply: 3,
      pointsInvite: 10,
      pointsCheckinBase: 5,
      pointsCheckinStreak: 10,
      pointsMemberThreshold: 30,
    };
    expect(pointsSettingsSchema.safeParse({ ...base, pointsThread: -1 }).success).toBe(false);
    expect(pointsSettingsSchema.safeParse({ ...base, pointsReply: 1001 }).success).toBe(false);
    expect(pointsSettingsSchema.safeParse({ ...base, pointsMemberThreshold: 10001 }).success).toBe(false);
    expect(pointsSettingsSchema.safeParse({ ...base, pointsInvite: "abc" }).success).toBe(false);
    expect(pointsSettingsSchema.safeParse({ ...base, pointsThread: undefined }).success).toBe(false);
  });

  it("签到分支持自定义基数/奖励", () => {
    expect(checkinPoints(1, 8, 20)).toBe(8);
    expect(checkinPoints(8, 8, 20)).toBe(28);
    // 缺省仍走历史默认值
    expect(checkinPoints(8)).toBe(15);
  });
});
