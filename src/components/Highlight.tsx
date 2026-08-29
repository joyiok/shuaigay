/**
 * 大小写不敏感的关键词高亮。纯展示组件,服务端/客户端都能用。
 * 输入只当纯文本处理(<mark> 文本由 React 自动转义),不会被注入 HTML。
 */
export function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle || !text) return <>{text}</>;

  const parts: { hit: boolean; text: string }[] = [];
  const lower = text.toLowerCase();
  const key = needle.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(key, i);
    if (at === -1) {
      parts.push({ hit: false, text: text.slice(i) });
      break;
    }
    if (at > i) parts.push({ hit: false, text: text.slice(i, at) });
    parts.push({ hit: true, text: text.slice(at, at + key.length) });
    i = at + key.length;
  }

  return (
    <>
      {parts.map((p, idx) =>
        p.hit ? (
          <mark key={idx} className="search-mark">
            {p.text}
          </mark>
        ) : (
          <span key={idx}>{p.text}</span>
        ),
      )}
    </>
  );
}