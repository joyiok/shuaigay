/**
 * 格式化给中文用户看的时间。论坛内容是 SEO 页面,固定时区保证 SSR 输出稳定。
 */
const formatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export function formatDate(d: Date | string | number): string {
  // unstable_cache 缓存恢复后 Date 会变成 ISO 字符串,统一 new Date 兜底
  return formatter.format(new Date(d));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const CAT_TONES = ["violet", "green", "orange", "blue", "pink", "teal"] as const;
export function catToneClass(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return `cat-${CAT_TONES[Math.abs(h) % CAT_TONES.length]}`;
}

/** 版块名 → 稳定色相（列表/搜索/无限滚动共用，避免各处各一套硬编码） */
const BOARD_TONES: [string, string][] = [
  ["综合", "cat-violet"],
  ["技术", "cat-blue"],
  ["生活", "cat-orange"],
  ["资源", "cat-green"],
  ["公告", "cat-pink"],
  ["小说", "cat-teal"],
];
export function boardToneClass(name: string): string {
  for (const [key, cls] of BOARD_TONES) if (name.includes(key)) return cls;
  return catToneClass(name);
}
