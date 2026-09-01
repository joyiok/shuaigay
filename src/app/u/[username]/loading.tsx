export default function Loading() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ height: 16, width: 140, borderRadius: 999, background: "var(--line-soft)" }} />
      <div className="card" style={{ padding: 18, display: "flex", gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--line-soft)", flexShrink: 0 }} />
        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          <div style={{ height: 16, width: 100, borderRadius: 8, background: "var(--line-soft)" }} />
          <div style={{ height: 12, borderRadius: 8, background: "var(--bg)", width: "70%" }} />
          <div style={{ height: 11, borderRadius: 999, background: "var(--bg)", width: "52%" }} />
        </div>
      </div>
      <ul className="post-list">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="post-item">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--line-soft)" }} />
            <div style={{ flex: 1, height: 12, borderRadius: 999, background: "var(--bg)" }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
