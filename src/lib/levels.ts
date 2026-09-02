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

export function levelIndexForPoints(points: number): number {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i].min) idx = i;
  return idx;
}

/** 距离下一级还差多少分;已是顶级返回 null */
export function nextLevelForPoints(points: number): { name: string; missing: number } | null {
  for (const l of LEVELS) if (points < l.min) return { name: l.name, missing: l.min - points };
  return null;
}

// 等级→权限（纯函数，Discuz 式用户组简化版）
export interface LevelPerms {
  dailyThreads: number;
  dailyReplies: number;
  maxUploadMB: number;
  canPostLink: boolean;
  canUpload: boolean;
}

export function permsForPoints(points: number): LevelPerms {
  const idx = levelIndexForPoints(points);
  if (idx >= 5) return { dailyThreads: 20, dailyReplies: 100, maxUploadMB: 20, canPostLink: true, canUpload: true }; // 元老
  if (idx >= 4) return { dailyThreads: 15, dailyReplies: 80, maxUploadMB: 20, canPostLink: true, canUpload: true }; // 金牌
  if (idx >= 3) return { dailyThreads: 10, dailyReplies: 50, maxUploadMB: 20, canPostLink: true, canUpload: true }; // 高级
  if (idx >= 2) return { dailyThreads: 8, dailyReplies: 40, maxUploadMB: 20, canPostLink: true, canUpload: true }; // 中级
  if (idx >= 1) return { dailyThreads: 5, dailyReplies: 20, maxUploadMB: 20, canPostLink: true, canUpload: true }; // 正式
  return { dailyThreads: 3, dailyReplies: 10, maxUploadMB: 5, canPostLink: false, canUpload: true }; // 新手
}

export function hasLink(text: string): boolean {
  return /https?:\/\//i.test(text);
}
