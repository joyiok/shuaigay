import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/auth";
import { db } from "@/lib/db";
import { createHash } from "node:crypto";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const dynamic = "force-dynamic";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  // 校验 token 合法性以决定是否展示表单
  let valid: boolean | null = null;
  if (token) {
    const rec = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
    valid = Boolean(rec && rec.type === "RESET_PASSWORD" && rec.expiresAt > new Date());
  }

  const ERRORS: Record<string, string> = {
    invalid: "新密码需 12 位以上，或 8 位+含 3 类字符",
    token_invalid: "链接无效或已过期，请重新申请",
    ratelimited: "尝试太频繁，请稍后再试",
  };

  if (token && valid === false) {
    return (
      <div style={{ maxWidth: 460, margin: "32px auto", padding: "0 8px" }}>
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <h1 className="auth-title">重置密码</h1>
          <p className="auth-note-error" style={{ marginTop: 16 }}>链接无效或已过期</p>
          <Link href="/forgot" className="btn-publish" style={{ marginTop: 6 }}>
            重新申请找回
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 460, margin: "32px auto", padding: "0 8px" }}>
      <div className="card" style={{ padding: 28 }}>
        <div style={{ marginBottom: 16 }}>
          <h1 className="auth-title">重置密码</h1>
          <p className="auth-sub">想一个记得住的，别再用上次那个</p>
        </div>
        {error && ERRORS[error] && <p className="auth-note-error">{ERRORS[error]}</p>}
        {!token && <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px" }}>请通过邮件中的链接访问此页（链接含 token 参数）。</p>}
        <form action={resetPasswordAction} style={{ display: "grid", gap: 18 }}>
          {token && <input type="hidden" name="token" value={token} />}
          {!token && (
            <label style={{ display: "grid", gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", letterSpacing: "0.02em" }}>重置 token</span>
              <input name="token" required placeholder="粘贴邮件中的 token" aria-label="重置 token" className="auth-input" />
            </label>
          )}
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", letterSpacing: "0.02em" }}>新密码</span>
            <input name="password" type="password" required minLength={8} placeholder="至少 8 位，建议 12 位以上" aria-label="新密码" className="auth-input" />
          </label>
          <button type="submit" className="auth-submit">
            重置密码
          </button>
        </form>
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <div style={{ height: 1, background: "var(--line-soft)", margin: "2px 0" }} />
          <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", margin: 0 }}>
            <Link href="/login" style={{ color: "var(--text)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>
              去登录 →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
