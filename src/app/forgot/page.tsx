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
    <div className="card" style={{ maxWidth: 380, margin: "0 auto", padding: 18 }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>找回密码</h1>
      {error && ERRORS[error] && (
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>{ERRORS[error]}</p>
      )}
      {sent && (
        <p style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>若该邮箱已注册，重置链接已发送（1 小时内有效），请查收。未收到可检查垃圾箱。</p>
      )}
      <form action={requestPasswordResetAction} style={{ display: "grid", gap: 10 }}>
        <input name="email" type="email" required placeholder="注册邮箱" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13, outline: "none" }} />
        <button type="submit" style={{ width: "100%", background: "var(--brand)", color: "#fff", borderRadius: 6, height: 36, fontSize: 14, fontWeight: 600, border: "1px solid var(--brand)" }}>发送重置链接</button>
      </form>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12, textAlign: "center" }}>
        想起密码了？ <Link href="/login" style={{ color: "var(--brand)" }}>去登录</Link>
      </p>
    </div>
  );
}
