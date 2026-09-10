import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/auth";

export const metadata = { title: "找回密码" };

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const ERRORS: Record<string, string> = {
    invalid: "邮箱格式不正确",
    ratelimited: "请求太频繁，请稍后再试",
  };
  return (
    <div style={{ maxWidth: 460, margin: "32px auto", padding: "0 8px" }}>
      <div className="card" style={{ padding: 28 }}>
        <div style={{ marginBottom: 16 }}>
          <h1 className="auth-title">找回密码</h1>
          <p className="auth-sub">填注册邮箱，链接发到邮箱里</p>
        </div>
        {error && ERRORS[error] && <p className="auth-note-error">{ERRORS[error]}</p>}
        {sent && (
          <p className="auth-note-success">若该邮箱已注册，重置链接已发送（1 小时内有效），请查收。未收到可检查垃圾箱。</p>
        )}
        <form action={requestPasswordResetAction} style={{ display: "grid", gap: 18 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", letterSpacing: "0.02em" }}>邮箱</span>
            <input name="email" type="email" required placeholder="you@example.com" aria-label="注册邮箱" className="auth-input" />
          </label>
          <button type="submit" className="auth-submit">
            发送重置链接
          </button>
        </form>
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <div style={{ height: 1, background: "var(--line-soft)", margin: "2px 0" }} />
          <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", margin: 0 }}>
            想起密码了？{" "}
            <Link href="/login" style={{ color: "var(--text)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>
              去登录 →
            </Link>
          </p>
        </div>
      </div>
      <p className="auth-foot">链接 1 小时内有效</p>
    </div>
  );
}
