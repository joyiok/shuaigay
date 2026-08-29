import Link from "next/link";
import { registerAction } from "@/app/actions/auth";

const ERRORS: Record<string, string> = {
  invalid: "输入格式不对(用户名 3-20 位字母数字下划线,密码至少 8 位)",
  email_taken: "该邮箱已注册",
  username_taken: "该用户名已被占用",
  ratelimited: "尝试太频繁,请稍后再试",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="card" style={{ maxWidth: 380, margin: "0 auto", padding: 18 }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>注册</h1>
      {error && ERRORS[error] && (
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>
          {ERRORS[error]}
        </p>
      )}
      <form action={registerAction} style={{ display: "grid", gap: 10 }}>
        <input
          name="email"
          type="email"
          required
          placeholder="邮箱"
          style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13, outline: "none" }}
        />
        <input
          name="username"
          required
          minLength={3}
          maxLength={20}
          pattern="[a-zA-Z0-9_-]{3,20}"
          placeholder="用户名(字母数字下划线)"
          style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13, outline: "none" }}
        />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="密码(至少 8 位)"
          style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13, outline: "none" }}
        />
        <button
          type="submit"
          style={{ width: "100%", background: "var(--brand)", color: "#fff", borderRadius: 6, height: 36, fontSize: 14, fontWeight: 600, border: "1px solid var(--brand)" }}
        >
          注册
        </button>
      </form>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12, textAlign: "center" }}>
        已有账号? <Link href="/login" style={{ color: "var(--brand)" }}>登录</Link>
      </p>
    </div>
  );
}
