import Link from "next/link";
import type { Metadata } from "next";
import { loginAction } from "@/app/actions/auth";
import Turnstile from "@/components/Turnstile";

export const metadata: Metadata = {
  title: "登录",
  description: "登录 SHUAI GAY 论坛 — 纸现场，回来坐坐。",
  robots: { index: false, follow: false },
  alternates: { canonical: "/login" },
};

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
    <div style={{ maxWidth: 440, margin: "24px auto", padding: "0 12px" }}>
      <div className="card" style={{ padding: 20, position: "relative", transform: "rotate(0.15deg)" }}>
        <div style={{ position: "absolute", top: -10, right: 28, width: 64, height: 14, background: "#FFF7A8", border: "1px solid rgba(17,17,20,0.12)", transform: "rotate(1.2deg)", boxShadow: "1px 1px 0 rgba(0,0,0,0.06)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--panel)", color: "var(--text)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, border: "2px solid var(--line)", boxShadow: "2px 2px 0 var(--line)", transform: "rotate(1.5deg)" }}>SG</span>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "Crimson Pro, serif", letterSpacing: "-0.02em", lineHeight: 1.1 }}>登录 — 回来坐坐</h1>
            <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "2px 0 0", fontFamily: "JetBrains Mono, monospace" }}>别让帖子等太久</p>
          </div>
        </div>

        {error && ERRORS[error] && (
          <div style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1.5px solid #fecaca", borderRadius: 10, padding: "10px 12px", fontSize: 12, marginBottom: 12, boxShadow: "2px 2px 0 rgba(220,38,38,0.08)", fontWeight: 600 }}>{ERRORS[error]}</div>
        )}
        {reset && <div style={{ background: "#DCFCE7", color: "#166534", border: "1.5px solid #86EFAC", borderRadius: 10, padding: "10px 12px", fontSize: 12, marginBottom: 12, fontWeight: 600 }}>密码已重置，请用新密码登录</div>}

        <form action={loginAction} style={{ display: "grid", gap: 12 }}>
          {next && <input type="hidden" name="next" value={next} />}
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", letterSpacing: "0.02em" }}>邮箱</span>
            <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" aria-label="邮箱" style={{ width: "100%", border: "2px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontSize: 13, outline: "none", background: "var(--panel)", boxShadow: "2px 2px 0 var(--line)", fontFamily: "JetBrains Mono, monospace" }} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", display: "flex", justifyContent: "space-between" }}>
              <span>密码</span>
              <Link href="/forgot" style={{ fontWeight: 500, color: "var(--text-subtle)", fontSize: 11, textDecoration: "underline", textUnderlineOffset: 2 }}>忘记了？</Link>
            </span>
            <input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" aria-label="密码" style={{ width: "100%", border: "2px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontSize: 13, outline: "none", background: "var(--panel)", boxShadow: "2px 2px 0 var(--line)" }} />
          </label>
          <Turnstile resetSignal={error} />
          <button type="submit" style={{ width: "100%", background: "var(--text)", color: "var(--panel)", border: "2px solid var(--line)", borderRadius: 999, height: 40, fontSize: 14, fontWeight: 700, boxShadow: "3px 3px 0 var(--line)", fontFamily: "Space Grotesk, sans-serif", cursor: "pointer" }}>
            登录 →
          </button>
        </form>

        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <div style={{ height: 1, background: "var(--line-soft)", margin: "2px 0" }} />
          <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", margin: 0 }}>
            没有账号？ <Link href="/register" style={{ color: "var(--text)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>注册一个 →</Link>
          </p>
        </div>
      </div>
      <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-subtle)", marginTop: 10, fontFamily: "JetBrains Mono, monospace" }}>回来就好，帖子还热着</p>
    </div>
  );
}
