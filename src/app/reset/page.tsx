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
      <div className="card" style={{ maxWidth: 380, margin: "0 auto", padding: 18, textAlign: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>重置密码</h1>
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>链接无效或已过期</p>
        <Link href="/forgot" style={{ color: "var(--brand)", fontSize: 13 }}>重新申请找回</Link>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 380, margin: "0 auto", padding: 18 }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>重置密码</h1>
      {error && ERRORS[error] && <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>{ERRORS[error]}</p>}
      {!token && <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>请通过邮件中的链接访问此页（链接含 token 参数）。</p>}
      <form action={resetPasswordAction} style={{ display: "grid", gap: 10 }}>
        {token && <input type="hidden" name="token" value={token} />}
        {!token && <input name="token" required placeholder="粘贴邮件中的 token" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13, outline: "none" }} />}
        <input name="password" type="password" required minLength={8} placeholder="新密码（至少 8 位）" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 13, outline: "none" }} />
        <button type="submit" style={{ width: "100%", background: "var(--brand)", color: "#fff", borderRadius: 6, height: 36, fontSize: 14, fontWeight: 600, border: "1px solid var(--brand)" }}>重置密码</button>
      </form>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12, textAlign: "center" }}>
        <Link href="/login" style={{ color: "var(--brand)" }}>去登录</Link>
      </p>
    </div>
  );
}
