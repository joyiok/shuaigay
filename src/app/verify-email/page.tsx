import Link from "next/link";
import { db } from "@/lib/db";
import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";
import { resendVerificationAction } from "@/app/actions/auth";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; ok?: string; error?: string; sent?: string }>;
}) {
  const { token, ok, error, sent } = await searchParams;

  // 带 token 直接校验(链接点击)
  if (token) {
    const tokenHash = hashToken(token);
    const record = await db.verificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.type !== "VERIFY_EMAIL" || record.expiresAt < new Date()) {
      logger.info("verify_email.invalid_token", { tokenHash: tokenHash.slice(0, 8) });
      return (
        <div className="card" style={{ maxWidth: 480, margin: "0 auto", padding: 18, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>验证失败</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>链接无效或已过期，请重新发送验证邮件。</p>
          <form action={resendVerificationAction}>
            <button style={{ background: "var(--brand)", color: "#fff", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, border: "1px solid var(--brand)" }}>重新发送验证邮件</button>
          </form>
        </div>
      );
    }
    await db.user.update({ where: { id: record.userId }, data: { emailVerified: true } });
    await db.verificationToken.delete({ where: { id: record.id } }).catch(() => {});
    logger.info("verify_email.success", { userId: record.userId });
    return (
      <div className="card" style={{ maxWidth: 480, margin: "0 auto", padding: 18, textAlign: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>验证成功</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>邮箱已验证，欢迎回来。</p>
        <Link href="/" style={{ color: "var(--brand)", fontSize: 13 }}>返回首页</Link>
      </div>
    );
  }

  if (ok) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: "0 auto", padding: 18, textAlign: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>验证成功</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>邮箱已验证。</p>
        <Link href="/" style={{ color: "var(--brand)", fontSize: 13 }}>返回首页</Link>
      </div>
    );
  }

  const ERRORS: Record<string, string> = {
    invalid: "链接无效",
    token_invalid: "链接无效或已过期",
    ratelimited: "发送太频繁，请稍后再试",
  };

  return (
    <div className="card" style={{ maxWidth: 480, margin: "0 auto", padding: 18 }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>验证邮箱</h1>
      {error && ERRORS[error] && <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>{ERRORS[error]}</p>}
      {sent && <p style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>验证邮件已发送，请查收（若未收到请检查垃圾箱）。</p>}
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>注册后我们已向你的邮箱发送验证链接，点击即可完成验证。若未收到，可重发。</p>
      <form action={resendVerificationAction}>
        <button style={{ width: "100%", background: "var(--brand)", color: "#fff", borderRadius: 6, height: 36, fontSize: 14, fontWeight: 600, border: "1px solid var(--brand)" }}>重发验证邮件</button>
      </form>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12, textAlign: "center" }}>
        <Link href="/" style={{ color: "var(--brand)" }}>返回首页</Link>
      </p>
    </div>
  );
}
