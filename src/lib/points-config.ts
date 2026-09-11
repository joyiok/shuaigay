/**
 * 积分规则配置：发帖/回帖/邀请/签到分值 + 正式会员功能线。
 * 存 SiteSetting 表，管理后台「站点设置」可改；内存缓存 60s（与 sensitive.ts 同模式）。
 * 等级展示 ladder（lib/levels.ts）保持写死——那是身份体系，改动频率低；这里管的是分值与门槛。
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
  /** 正式会员功能线：发外链 / 免新人待审 / 20MB 附件 */
  memberThreshold: number;
}

/** 与 schema.prisma 的 SiteSetting 默认值保持一致 */
export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  thread: 10,
  reply: 3,
  invite: 10,
  checkinBase: 5,
  checkinStreak: 10,
  memberThreshold: 30,
};

/** 后台表单校验：各项 0–1000，门槛 0–10000（0 = 关闭门槛，人人正式会员） */
export const pointsSettingsSchema = z.object({
  pointsThread: z.coerce.number().int().min(0).max(1000),
  pointsReply: z.coerce.number().int().min(0).max(1000),
  pointsInvite: z.coerce.number().int().min(0).max(1000),
  pointsCheckinBase: z.coerce.number().int().min(0).max(1000),
  pointsCheckinStreak: z.coerce.number().int().min(0).max(1000),
  pointsMemberThreshold: z.coerce.number().int().min(0).max(10000),
});

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
      },
    });
    if (row) {
      cache = {
        thread: row.pointsThread,
        reply: row.pointsReply,
        invite: row.pointsInvite,
        checkinBase: row.pointsCheckinBase,
        checkinStreak: row.pointsCheckinStreak,
        memberThreshold: row.pointsMemberThreshold,
      };
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
