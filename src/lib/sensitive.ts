/**
 * 极简敏感词表:命中即拒绝发布 / 回帖 / 举报。
 * 词表刻意保持克制,只收录公认的辱骂、攻击性词汇,避免误伤正常交流。
 */
const SENSITIVE_WORDS = [
  "傻逼",
  "傻b",
  "草泥马",
  "操你妈",
  "妈逼",
  "狗娘养",
  "去死吧",
  "婊子",
  "nmsl",
  "cnm",
];

/** 是否包含敏感词(大小写不敏感) */
export function containsSensitive(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSITIVE_WORDS.some((w) => lower.includes(w.toLowerCase()));
}