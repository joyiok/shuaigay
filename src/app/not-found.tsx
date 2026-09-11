import Link from "next/link";
import ErrorBeacon from "@/components/ErrorBeacon";

export default function NotFound() {
  return (
    <div className="error-shell">
      <ErrorBeacon kind="404" />
      <div
        aria-hidden="true"
        style={{
          width: 84,
          height: 84,
          borderRadius: 20,
          background: "var(--brand)",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 10px 26px -12px rgba(83,59,170,0.55)",
          fontWeight: 900,
          fontSize: 21,
          letterSpacing: "-0.03em",
        }}
      >
        404
      </div>

      <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <h1 className="error-title">页面不存在</h1>
        <p className="error-copy">
          你访问的内容可能已被删除、移动，或链接有误。试试回到首页或搜索关键词。
        </p>
      </div>

      <div className="error-actions">
        <Link href="/" className="btn-publish">
          返回首页
        </Link>
        <Link href="/search" className="btn-ghost">
          去搜索
        </Link>
      </div>

      <p className="error-tagline">SHUAI GAY · 极简社区</p>
    </div>
  );
}
