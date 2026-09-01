export default function Loading() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ height: 18, width: 180, borderRadius: 999, background: "var(--line-soft)" }} />
      <div className="card" style={{ height: 78, borderRadius: 16, background: "var(--panel)", border: "1px solid var(--line)" }} />
      <ul className="post-list">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="post-item" style={{ gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--line-soft)", flexShrink: 0 }} />
            <div style={{ flex: 1, display: "grid", gap: 8 }}>
              <div style={{ height: 14, borderRadius: 8, background: "var(--line-soft)", width: `${58 + (i % 3) * 8}%` }} />
              <div style={{ height: 11, borderRadius: 999, background: "var(--bg)", width: "38%" }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
