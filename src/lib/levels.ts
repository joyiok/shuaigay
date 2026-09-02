/**
 * 积分等级体系(纯函数,派生自 points,无需存库):
 * 发主题 +10 / 回复 +3 / 邀请注册 +10 / 管理员手工加减。
 */
export const THREAD_POINTS = 10;
export const REPLY_POINTS = 3;

export interface Level {
  min: number;
  name: string;
  bg: string;
  color: string;
  border: string;
}

export const LEVELS: Level[] = [
  { min: 0, name: "新手上路", bg: "#f3f4f6", color: "#4b5563", border: "#e5e7eb" },
  { min: 30, name: "正式会员", bg: "#eef2ff", color: "#4f46e5", border: "#e0e7ff" },
  { min: 100, name: "中级会员", bg: "#f0fdf4", color: "#16a34a", border: "#dcfce7" },
  { min: 300, name: "高级会员", bg: "#fff7ed", color: "#ea580c", border: "#ffedd5" },
  { min: 800, name: "金牌会员", bg: "#fefce8", color: "#ca8a04", border: "#fef9c3" },
  { min: 2000, name: "论坛元老", bg: "#fdf2f8", color: "#db2777", border: "#fce7f3" },
];

export function levelForPoints(points: number): Level {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (points >= l.min) cur = l;
  return cur;
}

/** 距离下一级还差多少分;已是顶级返回 null */
export function nextLevelForPoints(points: number): { name: string; missing: number } | null {
  for (const l of LEVELS) if (points < l.min) return { name: l.name, missing: l.min - points };
  return null;
}
