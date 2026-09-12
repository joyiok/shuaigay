/**
 * 每日签到：一天一次，连续签到有额外奖励。
 * 唯一键 (userId, day) 保证幂等，重复点也只算一次。
 */
import { db } from "./db";
import { dayForDb } from "./visit-stats";
import { DEFAULT_POINTS_CONFIG, getPointsConfig } from "./points-config";

export const CHECKIN_BASE_POINTS = 5;
/** 每连续 7 天额外奖励 */
export const CHECKIN_STREAK_BONUS = 10;

/** 连续第 N 天可得积分（纯函数，便于测试；base/bonus 缺省用默认配置） */
export function checkinPoints(streak: number, base = CHECKIN_BASE_POINTS, bonus = CHECKIN_STREAK_BONUS): number {
  const s = Math.max(1, Math.floor(streak));
  return base + Math.floor((s - 1) / 7) * bonus;
}

export interface CheckInState {
  doneToday: boolean;
  streak: number;
  /** 本月签到天数 */
  monthCount: number;
  /** 最近 14 天是否签到（老 → 新），用于小格子展示 */
  recent: boolean[];
  nextPoints: number;
}

const DAY_MS = 86_400_000;

export async function getCheckInState(userId: string): Promise<CheckInState> {
  const today = dayForDb(new Date());
  const monthStart = dayForDb(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [todayRow, latest, monthCount, recentRows] = await Promise.all([
    db.checkIn.findUnique({ where: { userId_day: { userId, day: today } }, select: { streak: true, points: true } }).catch(() => null),
    db.checkIn.findFirst({ where: { userId }, orderBy: { day: "desc" }, select: { day: true, streak: true } }).catch(() => null),
    db.checkIn.count({ where: { userId, day: { gte: monthStart } } }).catch(() => 0),
    db.checkIn
      .findMany({ where: { userId, day: { gte: new Date(today.getTime() - 13 * DAY_MS) } }, select: { day: true } })
      .catch(() => []),
  ]);

  const dayset = new Set(recentRows.map((r) => dayForDb(r.day).getTime()));
  const recent: boolean[] = [];
  for (let i = 13; i >= 0; i--) {
    recent.push(dayset.has(dayForDb(new Date(today.getTime() - i * DAY_MS)).getTime()));
  }

  let streak = todayRow?.streak ?? latest?.streak ?? 0;
  if (!todayRow && latest) {
    // 昨天签过则连续延续，否则清零
    const gap = Math.round((today.getTime() - dayForDb(latest.day).getTime()) / DAY_MS);
    if (gap > 1) streak = 0;
  }
  const nextStreak = todayRow ? streak : streak + 1;
  const pc = await getPointsConfig().catch(() => DEFAULT_POINTS_CONFIG);
  return {
    doneToday: !!todayRow,
    streak,
    monthCount,
    recent,
    nextPoints: checkinPoints(nextStreak, pc.checkinBase, pc.checkinStreak),
  };
}

/** 签到：返回本次得分与新的连续天数 */
export async function doCheckIn(userId: string): Promise<{ ok: boolean; points?: number; streak?: number; error?: string }> {
  const today = dayForDb(new Date());
  const yesterday = dayForDb(new Date(today.getTime() - DAY_MS));
  const [exists, prev] = await Promise.all([
    db.checkIn.findUnique({ where: { userId_day: { userId, day: today } }, select: { id: true } }).catch(() => null),
    db.checkIn.findUnique({ where: { userId_day: { userId, day: yesterday } }, select: { streak: true } }).catch(() => null),
  ]);
  if (exists) return { ok: false, error: "今天已经签过了" };

  const streak = (prev?.streak ?? 0) + 1;
  const pc = await getPointsConfig().catch(() => DEFAULT_POINTS_CONFIG);
  const points = checkinPoints(streak, pc.checkinBase, pc.checkinStreak);
  try {
    const { applyPoints } = await import("./points");
    await db.$transaction(async (tx) => {
      const row = await tx.checkIn.create({ data: { userId, day: today, points, streak } });
      await applyPoints(tx, userId, points, "checkin", { refType: "checkin", refId: row.id });
    });
  } catch {
    // 并发下的唯一键冲突：当作已签到
    return { ok: false, error: "今天已经签过了" };
  }
  return { ok: true, points, streak };
}
