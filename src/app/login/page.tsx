import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import Turnstile from "@/components/Turnstile";

const ERRORS: Record<string, string> = {
  invalid: "输入格式不对",
  wrong: "邮箱或密码不正确",
  ratelimited: "尝试太频繁,请稍后再试",
  captcha_failed: "人机验证未通过，请重新验证后重试",
  banned: "账号已被封禁，请联系管理员（403）",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; reset?: string }>;
}) {
  const { error, next, reset } = await searchParams;

  return (
    <div className="card" style={{ maxWidth: 380, margin: "0 auto", padding: 18 }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>登录</h1>
      {error && ERRORS[error] && (
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>
          {ERRORS[error]}
        </p>
      )}
      {reset && <p style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>密码已重置，请用新密码登录。</p>}
      <form action={loginAction} style={{ display: "grid", gap: 10 }}>
        {next && <input type="hidden" name="next" value={next} />}
        <input
          name="email"
          type="email"
          required
          placeholder="邮箱"
          style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13, outline: "none" }}
        />
        <input
          name="password"
          type="password"
          required
          placeholder="密码"
          style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13, outline: "none" }}
        />
        <Turnstile resetSignal={error} />
        <button
          type="submit"
          style={{ width: "100%", background: "var(--brand)", color: "#fff", borderRadius: 6, height: 36, fontSize: 14, fontWeight: 600, border: "1px solid var(--brand)" }}
        >
          登录
        </button>
      </form>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12, textAlign: "center" }}>
        <Link href="/forgot" style={{ color: "var(--brand)" }}>忘记密码？</Link> · 没有账号? <Link href="/register" style={{ color: "var(--brand)" }}>注册</Link>
      </p>
    </div>
  );
}
