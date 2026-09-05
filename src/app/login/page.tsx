import Link from "next/link";
import type { Metadata } from "next";
import { loginAction } from "@/app/actions/auth";
import Turnstile from "@/components/Turnstile";
import HumanizedFeedback from "@/components/HumanizedFeedback";

export const metadata: Metadata = {
  title: "登录",
  description: "登录 SHUAI GAY 论坛 — 纸现场，回来坐坐。",
  robots: { index: false, follow: false },
  alternates: { canonical: "/login" },
};

const ERRORS: Record<string, { title: string; msg: string; tip: string }> = {
  invalid: { title: "少填了点", msg: "邮箱和密码都得填。", tip: "检查下是不是漏了" },
  wrong: { title: "邮箱或密码不对", msg: "要么邮箱错，要么密码错。", tip: "试试找回密码，或检查大小写" },
  ratelimited: { title: "试太多次了", msg: "系统怕你是机器人，歇 10 分钟。", tip: "等会再试，或清下缓存" },
  captcha_failed: { title: "验证没过", msg: "人机验证失败。", tip: "刷新一下重验" },
  banned: { title: "账号被封了", msg: "封禁中，暂时登不了。", tip: "联系管理员或等解封" },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; reset?: string }>;
}) {
  const { error, next, reset } = await searchParams;

  return (
    <div style={{ maxWidth: 460, margin: "32px auto", padding: "0 8px" }}>
      <div className="card" style={{ padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span className="brand-mark">SG</span>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.5 }}>登录 — 回来坐坐</h1>
            <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "2px 0 0", }}>别让帖子等太久</p>
          </div>
        </div>

        {error && ERRORS[error] && (
          <div style={{ marginBottom: 12 }}><HumanizedFeedback type="error" title={ERRORS[error].title} message={ERRORS[error].msg} suggestion={ERRORS[error].tip} /></div>
        )}
        {reset && <div style={{ marginBottom: 12 }}><HumanizedFeedback type="success" title="密码已重置" message="用新密码登录就行。" suggestion="别再忘了，加个密码管理器？" /></div>}

        <form action={loginAction} style={{ display: "grid", gap: 18 }}>
          {next && <input type="hidden" name="next" value={next} />}
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", letterSpacing: "0.02em" }}>邮箱</span>
            <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" aria-label="邮箱" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontSize: 16, outline: "none", background: "var(--panel)", }} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", display: "flex", justifyContent: "space-between" }}>
              <span>密码</span>
              <Link href="/forgot" style={{ fontWeight: 500, color: "var(--text-subtle)", fontSize: 12, textDecoration: "underline", textUnderlineOffset: 2 }}>忘记了？</Link>
            </span>
            <input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" aria-label="密码" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontSize: 16, outline: "none", background: "var(--panel)" }} />
          </label>
          <Turnstile resetSignal={error} />
          <button type="submit" className="btn-publish" style={{ width: "100%", minHeight: 44 }}>
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
      <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-subtle)", marginTop: 10, }}>回来就好，帖子还热着</p>
    </div>
  );
}
