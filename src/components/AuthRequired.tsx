import Link from "next/link";

interface AuthRequiredProps {
  title?: string;
  description?: string;
  next?: string;
}

export default function AuthRequired({
  title = "需要登录",
  description = "登录后才能访问此页面，注册仅需一分钟。",
  next,
}: AuthRequiredProps) {
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <div
      className="card"
      style={{
        padding: "36px 20px",
        display: "grid",
        gap: 16,
        justifyItems: "center",
        textAlign: "center",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 72,
          height: 72,
          borderRadius: 999,
          background: "#f1f5f9",
          border: "1px solid #e2e8f0",
          display: "grid",
          placeItems: "center",
          color: "#0f172a",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth={1.7} />
          <path d="M4 20c1.8-4 4.5-6 8-6s6.2 2 8 6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
        </svg>
      </div>

      <div style={{ display: "grid", gap: 6, maxWidth: 420 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{title}</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>{description}</p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          href={loginHref}
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
          登录
        </Link>
        <Link
          href={registerHref}
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
          注册
        </Link>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>
        已有账号？直接 <Link href={loginHref} style={{ color: "#0f172a", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}>登录</Link> 即可
      </p>
    </div>
  );
}
