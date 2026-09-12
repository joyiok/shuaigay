/**
 * 积分规则配置：发帖/回帖/邀请/签到分值 + 正式会员功能线 + 等级 ladder 门槛。
 * 存 SiteSetting 表，管理后台「站点设置」可改；内存缓存 60s（与 sensitive.ts 同模式）。
 * 等级名字/配色固定（身份体系），门槛可配：第 1 档恒为 0，第 2 档复用会员线。
 */
import { z } from "zod";
import { db } from "./db";

export interface PointsConfig {
  /** 发主题加分 */
  thread: number;
  /** 回帖加分 */
  reply: number;
  /** 邀请注册给邀请人加分 */
  invite: number;
  /** 签到基础分 */
  checkinBase: number;
  /** 每连续 7 天的额外奖励 */
  checkinStreak: number;
  /** 正式会员功能线：发外链 / 免新人待审 / 20MB 附件（= ladder 第 2 档） */
  memberThreshold: number;
  /** ladder 第 3–6 档门槛 */
  level3: number;
  level4: number;
  level5: number;
  level6: number;
}

/** 与 schema.prisma 的 SiteSetting 默认值保持一致 */
export const DEFAULT_POINTS_CONFIG: PointsConfig = {
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
};

/** 后台表单校验：各项 0–1000，门槛 0–10000（0 = 关闭门槛，人人正式会员） */
const basePointsSettingsSchema = z.object({
  pointsThread: z.coerce.number().int().min(0).max(1000),
  pointsReply: z.coerce.number().int().min(0).max(1000),
  pointsInvite: z.coerce.number().int().min(0).max(1000),
  pointsCheckinBase: z.coerce.number().int().min(0).max(1000),
  pointsCheckinStreak: z.coerce.number().int().min(0).max(1000),
  pointsMemberThreshold: z.coerce.number().int().min(0).max(10000),
  pointsLevel3: z.coerce.number().int().min(0).max(100000),
  pointsLevel4: z.coerce.number().int().min(0).max(100000),
  pointsLevel5: z.coerce.number().int().min(0).max(100000),
  pointsLevel6: z.coerce.number().int().min(0).max(100000),
});

/** ladder 必须严格递增（第 1 档恒 0 不存库），否则等级判定会错乱 */
export const pointsSettingsSchema = basePointsSettingsSchema.refine(
  (v) =>
    v.pointsMemberThreshold < v.pointsLevel3 &&
    v.pointsLevel3 < v.pointsLevel4 &&
    v.pointsLevel4 < v.pointsLevel5 &&
    v.pointsLevel5 < v.pointsLevel6,
  { message: "ladder_must_increase" },
);

let cache: PointsConfig | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

export async function getPointsConfig(): Promise<PointsConfig> {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;
  try {
    const row = await db.siteSetting.findUnique({
      where: { id: "site" },
      select: {
        pointsThread: true,
        pointsReply: true,
        pointsInvite: true,
        pointsCheckinBase: true,
        pointsCheckinStreak: true,
        pointsMemberThreshold: true,
        pointsLevel3: true,
        pointsLevel4: true,
        pointsLevel5: true,
        pointsLevel6: true,
      },
    });
    if (row) {
      const next: PointsConfig = {
        thread: row.pointsThread,
        reply: row.pointsReply,
        invite: row.pointsInvite,
        checkinBase: row.pointsCheckinBase,
        checkinStreak: row.pointsCheckinStreak,
        memberThreshold: row.pointsMemberThreshold,
        level3: row.pointsLevel3,
        level4: row.pointsLevel4,
        level5: row.pointsLevel5,
        level6: row.pointsLevel6,
      };
      // 库里若被绕过校验写入乱序（历史/手工改库），回退单项默认值，保证单调
      const safe: PointsConfig = { ...DEFAULT_POINTS_CONFIG };
      safe.thread = next.thread;
      safe.reply = next.reply;
      safe.invite = next.invite;
      safe.checkinBase = next.checkinBase;
      safe.checkinStreak = next.checkinStreak;
      let prev = 0;
      const ordered = [next.memberThreshold, next.level3, next.level4, next.level5, next.level6];
      const fallback = [DEFAULT_POINTS_CONFIG.memberThreshold, 100, 300, 800, 2000];
      const keys = ["memberThreshold", "level3", "level4", "level5", "level6"] as const;
      for (let i = 0; i < keys.length; i++) {
        const v = ordered[i]!;
        if (Number.isFinite(v) && v > prev) {
          safe[keys[i]] = v;
          prev = v;
        } else {
          const f = Math.max(fallback[i]!, prev + 1);
          safe[keys[i]] = f;
          prev = f;
        }
      }
      cache = safe;
      cacheAt = now;
      return cache;
    }
  } catch {
    // DB 不可用时回退默认值，不阻断发帖/签到主流程
  }
  return cache ?? DEFAULT_POINTS_CONFIG;
}

/** 后台保存后调用，60s 缓存立即失效 */
export function clearPointsConfigCache(): void {
  cache = null;
  cacheAt = 0;
}
