import Link from "next/link";

interface AuthRequiredProps {
  title?: string;
  description?: string;
  next?: string;
}

export default function AuthRequired({
  title = "需要登录",
  description = "登录后才能继续，注册仅需一分钟。",
  next,
}: AuthRequiredProps) {
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <div className="card auth-gate">
      <div className="auth-gate-icon" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth={1.7} />
          <path d="M4 20c1.8-4 4.5-6 8-6s6.2 2 8 6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
        </svg>
      </div>

      <div className="auth-gate-copy">
        <h2 className="auth-gate-title">{title}</h2>
        <p className="auth-gate-desc">{description}</p>
      </div>

      <div className="auth-gate-actions">
        <Link href={loginHref} className="btn-publish" style={{ minHeight: 38 }}>
          登录
        </Link>
        <Link href={registerHref} className="btn-ghost">
          注册
        </Link>
      </div>
    </div>
  );
}
