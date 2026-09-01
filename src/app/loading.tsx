/** 全站回退 loading — 极简骨架，避免路由切换白屏 */
export default function Loading() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* banner 骨架 */}
      <div className="card" style={{ height: 168, borderRadius: 20, background: "linear-gradient(135deg,#f5f3ff,#ede9fe)", border: "1px solid var(--line)", display: "grid", placeItems: "center" }} aria-busy="true" aria-label="加载中">
        <div style={{ width: 36, height: 36, borderRadius: 999, border: "3px solid #ddd6fe", borderTopColor: "#7c3aed", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
      {/* 帖子骨架 6 条 */}
      <ul className="post-list" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="post-item" style={{ gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--line-soft)", flexShrink: 0 }} />
            <div style={{ flex: 1, display: "grid", gap: 8 }}>
              <div style={{ height: 14, borderRadius: 8, background: "var(--line-soft)", width: `${62 + (i % 3) * 10}%` }} />
              <div style={{ height: 11, borderRadius: 999, background: "var(--bg)", width: "40%" }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
