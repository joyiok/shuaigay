export default function Loading() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ height: 18, width: 220, borderRadius: 999, background: "var(--line-soft)" }} />
      <div className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
        <div style={{ height: 18, borderRadius: 8, background: "var(--line-soft)", width: "66%" }} />
        <div style={{ height: 12, borderRadius: 999, background: "var(--bg)", width: "44%" }} />
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} style={{ padding: 14, borderBottom: i === 2 ? "none" : "1px solid var(--bg)", display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--line-soft)" }} />
                <div style={{ height: 12, width: 80, borderRadius: 999, background: "var(--line-soft)" }} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ height: 13, borderRadius: 8, background: "var(--bg)", width: "92%" }} />
                <div style={{ height: 13, borderRadius: 8, background: "var(--bg)", width: "78%" }} />
                <div style={{ height: 13, borderRadius: 8, background: "var(--bg)", width: "84%" }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
