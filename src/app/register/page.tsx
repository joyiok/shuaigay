import Link from "next/link";
import type { Metadata } from "next";
import { registerAction } from "@/app/actions/auth";
import Turnstile from "@/components/Turnstile";

export const metadata: Metadata = {
  title: "注册",
  description: "注册 SHUAI GAY 论坛 — 加入开放 · 克制 · 高效的极简社区，支持邀请码。",
  robots: { index: false, follow: false },
  alternates: { canonical: "/register" },
};

const ERRORS: Record<string, string> = {
  invalid: "输入格式不对(用户名 3-20 位字母数字下划线,密码至少 8 位)",
  email_taken: "该邮箱已注册",
  username_taken: "该用户名已被占用",
  ratelimited: "尝试太频繁,请稍后再试",
  invite_invalid: "邀请码无效或已被用完",
  captcha_failed: "人机验证未通过，请重新验证后重试",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const { error, invite } = await searchParams;
  const inviteCode = typeof invite === "string" ? invite.trim().slice(0, 32) : "";

  return (
    <div className="card" style={{ maxWidth: 380, margin: "0 auto", padding: 18 }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>注册</h1>
      {error && ERRORS[error] && (
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>
          {ERRORS[error]}
        </p>
      )}
      {inviteCode && (
        <p
          style={{
            background: "var(--brand-soft)",
            color: "var(--text-muted)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          受邀注册 · 邀请码 <strong style={{ color: "var(--text)", letterSpacing: "0.04em" }}>{inviteCode}</strong>
        </p>
      )}
      <form action={registerAction} style={{ display: "grid", gap: 10 }}>
        {inviteCode && <input type="hidden" name="invite" value={inviteCode} />}
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>邮箱</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            aria-label="邮箱"
            style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13, outline: "none" }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>用户名</span>
          <input
            name="username"
            required
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_-]{3,20}"
            autoComplete="username"
            placeholder="3-20 位 字母/数字/下划线"
            aria-label="用户名"
            style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13, outline: "none" }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>密码</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="至少 8 位"
            aria-label="密码"
            style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13, outline: "none" }}
          />
        </label>
        <Turnstile resetSignal={error} />
        <button
          type="submit"
          style={{ width: "100%", background: "var(--brand)", color: "#fff", borderRadius: 6, height: 36, fontSize: 14, fontWeight: 600, border: "1px solid var(--brand)" }}
        >
          {inviteCode ? "接受邀请,注册" : "注册"}
        </button>
      </form>
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8, textAlign: "center" }}>注册后将发送验证邮件，请及时查收并完成验证。</p>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12, textAlign: "center" }}>
        已有账号? <Link href="/login" style={{ color: "var(--brand)" }}>登录</Link>
      </p>
    </div>
  );
}