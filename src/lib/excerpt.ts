/**
 * 从 Markdown 原文里截取命中关键词附近的纯文本摘录,服务端算好,
 * 客户端渲染时只负责高亮关键词,不需要懂 Markdown。
 */
export function makeExcerpt(raw: string, q: string, radius = 60): string {
  const clean = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/[#>*_`~\[\]()!|<>\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const needle = q.trim();
  if (!needle) return clean.slice(0, radius * 2);

  const idx = clean.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) {
    // 理论上不会发生(查询条件已命中),兜底截头
    return clean.slice(0, radius * 2);
  }

  const start = Math.max(0, idx - radius);
  const end = Math.min(clean.length, idx + needle.length + radius);
  return (
    (start > 0 ? "…" : "") +
    clean.slice(start, end) +
    (end < clean.length ? "…" : "")
  );
}