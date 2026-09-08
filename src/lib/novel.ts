/**
 * 小说板块的纯函数：章节标题推导。
 * 章节 = 作者在小说主题里的连续回复；标题取正文第一行的可读文本。
 */

const MAX_TITLE = 24;

/** 从章节正文推导目录标题；没有可用首行时退回「第 N 章」 */
export function novelChapterTitle(md: string, index: number): string {
  const line = md
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith("![") && !s.startsWith("["));
  const clean = (line ?? "").replace(/^#+\s*/, "").replace(/[*_`>]/g, "").trim();
  return clean ? clean.slice(0, MAX_TITLE) : `第 ${index} 章`;
}
