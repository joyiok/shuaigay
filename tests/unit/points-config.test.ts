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
      level3: 100,
      level4: 300,
      level5: 800,
      level6: 2000,
    });
  });

  it("ladder 必须严格递增，否则拒绝", () => {
    const base = {
      pointsThread: 10,
      pointsReply: 3,
      pointsInvite: 10,
      pointsCheckinBase: 5,
      pointsCheckinStreak: 10,
      pointsMemberThreshold: 30,
      pointsLevel3: 100,
      pointsLevel4: 300,
      pointsLevel5: 800,
      pointsLevel6: 2000,
    };
    expect(pointsSettingsSchema.safeParse(base).success).toBe(true);
    // 乱序与相等都不行
    expect(pointsSettingsSchema.safeParse({ ...base, pointsLevel4: 100 }).success).toBe(false);
    expect(pointsSettingsSchema.safeParse({ ...base, pointsLevel3: 30 }).success).toBe(false);
    expect(pointsSettingsSchema.safeParse({ ...base, pointsMemberThreshold: 100 }).success).toBe(false);
  });

  it("后台表单校验：合法通过", () => {
    const r = pointsSettingsSchema.safeParse({
      pointsThread: "20",
      pointsReply: "5",
      pointsInvite: "15",
      pointsCheckinBase: "8",
      pointsCheckinStreak: "20",
      pointsMemberThreshold: "50",
      pointsLevel3: "150",
      pointsLevel4: "400",
      pointsLevel5: "900",
      pointsLevel6: "2500",
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
      pointsLevel3: 100,
      pointsLevel4: 300,
      pointsLevel5: 800,
      pointsLevel6: 2000,
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

describe("ladder 自定义门槛", () => {
  it("levelForPoints/nextLevel/perms 跟随自定义 ladder", async () => {
    const { buildLadder, levelForPoints, nextLevelForPoints, permsForPoints } = await import("@/lib/levels");
    const ladder = buildLadder({ memberThreshold: 50, level3: 150, level4: 400, level5: 900, level6: 2500 });
    expect(ladder).toEqual([0, 50, 150, 400, 900, 2500]);
    // 40 分在新 ladder 下还是新手
    expect(levelForPoints(40, ladder).name).toBe("新手上路");
    expect(levelForPoints(40).name).toBe("正式会员");
    expect(nextLevelForPoints(40, ladder)).toEqual({ name: "正式会员", missing: 10 });
    // 权限档位同样跟随
    expect(permsForPoints(40, ladder).canPostLink).toBe(false);
    expect(permsForPoints(40).canPostLink).toBe(true);
    expect(permsForPoints(40, ladder).maxUploadMB).toBe(5);
  });
});
