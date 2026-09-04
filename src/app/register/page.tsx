import Link from "next/link";
import type { Metadata } from "next";
import { registerAction } from "@/app/actions/auth";
import Turnstile from "@/components/Turnstile";
import HumanizedFeedback from "@/components/HumanizedFeedback";

export const metadata: Metadata = {
  title: "注册",
  description: "注册 SHUAI GAY 论坛 — 纸现场，进来就当自己家。",
  robots: { index: false, follow: false },
  alternates: { canonical: "/register" },
};

const ERRORS: Record<string, { title: string; msg: string; tip: string }> = {
  invalid: { title: "格式不太对", msg: "用户名 3-20 位字母/数字/_/-；密码 12 位以上，或 8 位+含 3 类字符（大小写/数字/符号），别用常见弱密码。", tip: "试试 shuaigay_01 这种用户名，密码整个长的" },
  email_taken: { title: "邮箱已注册", msg: "这个邮箱已经有账号了。", tip: "直接去登录，或用另一个邮箱" },
  username_taken: { title: "用户名被占了", msg: "换个更骚的名字？", tip: "加个数字或下划线，比如 shuaigay_02" },
  taken: { title: "注册不了", msg: "这个邮箱或用户名已经被用了。", tip: "换个邮箱或用户名再试，实在不行直接去登录" },
  ratelimited: { title: "手速太快", msg: "尝试太频繁，喝口水再试。", tip: "等 1 分钟，系统在保护你" },
  invite_invalid: { title: "邀请码不对", msg: "邀请码无效或已被用完。", tip: "找邀请人要个新的，或先不填邀请码直接注册" },
  captcha_failed: { title: "人机验证没过", msg: "请重新点一下验证。", tip: "有时网慢，多试一次" },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const { error, invite } = await searchParams;
  const inviteCode = typeof invite === "string" ? invite.trim().slice(0, 32) : "";

  return (
    <div style={{ maxWidth: 440, margin: "24px auto", padding: "0 12px" }}>
      <div className="card" style={{ padding: 20, position: "relative", transform: "rotate(-0.2deg)" }}>
        <div style={{ position: "absolute", top: -10, left: 24, width: 72, height: 14, background: "#FFF7A8", border: "1px solid rgba(17,17,20,0.12)", transform: "rotate(-1deg)", boxShadow: "1px 1px 0 rgba(0,0,0,0.06)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--text)", color: "var(--panel)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, border: "2px solid var(--line)", boxShadow: "2px 2px 0 var(--line)", transform: "rotate(-2deg)" }}>SG</span>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "Crimson Pro, serif", letterSpacing: "-0.02em", lineHeight: 1.1 }}>注册 — 进来坐坐</h1>
            <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "2px 0 0", fontFamily: "JetBrains Mono, monospace" }}>3 分钟，丢个帖子就行</p>
          </div>
        </div>

        {error && ERRORS[error] && (
          <div style={{ marginBottom: 12 }}><HumanizedFeedback type="error" title={ERRORS[error].title} message={ERRORS[error].msg} suggestion={ERRORS[error].tip} /></div>
        )}
        {inviteCode && (
          <div style={{ background: "#FFF7A8", border: "1.5px solid var(--line)", borderRadius: 10, padding: "10px 12px", fontSize: 12, marginBottom: 12, boxShadow: "2px 2px 0 var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)" }}>受邀注册</span>
            <strong style={{ fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.06em", background: "var(--panel)", border: "1px solid var(--line)", padding: "2px 8px", borderRadius: 999 }}>{inviteCode}</strong>
          </div>
        )}

        <form action={registerAction} style={{ display: "grid", gap: 12 }}>
          {inviteCode && <input type="hidden" name="invite" value={inviteCode} />}
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", letterSpacing: "0.02em", fontFamily: "Space Grotesk, sans-serif" }}>邮箱</span>
            <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" aria-label="邮箱" style={{ width: "100%", border: "2px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontSize: 13, outline: "none", background: "var(--panel)", boxShadow: "2px 2px 0 var(--line)", fontFamily: "JetBrains Mono, monospace" }} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", letterSpacing: "0.02em" }}>用户名 <span style={{ fontWeight: 400, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>3-20 位 字母/数字/_/-</span></span>
            <input name="username" required minLength={3} maxLength={20} pattern="[a-zA-Z0-9_-]{3,20}" autoComplete="username" placeholder="shuaigay_01" aria-label="用户名" style={{ width: "100%", border: "2px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontSize: 13, outline: "none", background: "var(--panel)", boxShadow: "2px 2px 0 var(--line)", fontFamily: "JetBrains Mono, monospace" }} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>密码 <span style={{ fontWeight: 400, color: "var(--text-subtle)", fontSize: 10 }}>至少 8 位</span></span>
            <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" aria-label="密码" style={{ width: "100%", border: "2px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontSize: 13, outline: "none", background: "var(--panel)", boxShadow: "2px 2px 0 var(--line)" }} />
          </label>
          <Turnstile resetSignal={error} />
          <button type="submit" style={{ width: "100%", background: "var(--text)", color: "var(--panel)", border: "2px solid var(--line)", borderRadius: 999, height: 40, fontSize: 14, fontWeight: 700, boxShadow: "3px 3px 0 var(--line)", fontFamily: "Space Grotesk, sans-serif", cursor: "pointer" }}>
            {inviteCode ? "接受邀请，注册 →" : "注册 — 去吹水"}
          </button>
        </form>

        <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-soft)", border: "1px dashed var(--line-soft)", borderRadius: 10, fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.5, fontFamily: "JetBrains Mono, monospace", textAlign: "center" }}>
          注册后会发验证邮件，不验也能先逛，验了更像自己人
        </div>

        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 14, textAlign: "center", fontFamily: "Space Grotesk, sans-serif" }}>
          已有账号？ <Link href="/login" style={{ color: "var(--text)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>登录 →</Link>
        </p>
      </div>
      <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-subtle)", marginTop: 10, fontFamily: "JetBrains Mono, monospace" }}>注册即表示你同意当自己家，别端着</p>
    </div>
  );
}
