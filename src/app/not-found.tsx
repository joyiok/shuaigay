import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ display: "grid", gap: 16, justifyItems: "center", padding: "56px 16px 40px", textAlign: "center" }}>
      <div
        aria-hidden="true"
        style={{
          width: 88,
          height: 88,
          borderRadius: 999,
          background: "#0f172a",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
          fontWeight: 900,
          fontSize: 22,
          letterSpacing: "-0.04em",
        }}
      >
        404
      </div>

      <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>页面不存在</h1>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>
          你访问的内容可能已被删除、移动，或链接有误。试试回到首页或搜索关键词。
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 36,
            padding: "0 18px",
            background: "#0f172a",
            color: "#fff",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            border: "1px solid #0f172a",
          }}
        >
          返回首页
        </Link>
        <Link
          href="/search"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 36,
            padding: "0 18px",
            background: "#fff",
            color: "#0f172a",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            border: "1px solid #e2e8f0",
          }}
        >
          去搜索
        </Link>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
        SHUAI GAY · slate-900 极简
      </p>
    </div>
  );
}
