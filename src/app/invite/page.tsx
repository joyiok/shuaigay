import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { generateInviteAction } from "@/app/actions/user";
import CopyButton from "@/components/CopyButton";
import EmptyState from "@/components/EmptyState";
import AuthRequired from "@/components/AuthRequired";

export const metadata: Metadata = {
  title: "我的邀请",
  description: "邀请好友加入 SHUAI GAY 论坛，邀请成功双方均获积分。",
  robots: { index: false, follow: false },
};

const MAX_INVITES = 5;

export default async function InvitePage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="breadcrumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>我的邀请</span>
        </div>
        <AuthRequired title="请先登录查看邀请码" description="邀请码与积分挂钩，登录后可生成、分享并查看使用情况。" next="/invite" />
      </div>
    );
  }

  const invites = await db.invite.findMany({
    where: { inviterId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const activeCount = invites.filter((i) => i.usedCount < i.maxUses).length;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>我的邀请</span>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>邀请码</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4, maxWidth: 520, lineHeight: 1.6 }}>
              把邀请链接发给好友,对方用你的邀请码注册成功后,你获得{" "}
              <strong style={{ color: "var(--brand)" }}>+10 积分</strong>
              。每人最多生成 {MAX_INVITES} 个邀请码。
            </p>
          </div>
          <form action={generateInviteAction}>
            <button
              type="submit"
              disabled={invites.length >= MAX_INVITES}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 32,
                padding: "0 14px",
                background: invites.length >= MAX_INVITES ? "var(--line-soft)" : "var(--brand)",
                color: invites.length >= MAX_INVITES ? "var(--text-subtle)" : "#fff",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: invites.length >= MAX_INVITES ? "not-allowed" : "pointer",
              }}
            >
              生成新码
            </button>
          </form>
        </div>
        {invites.length >= MAX_INVITES && (
          <p style={{ color: "var(--text-subtle)", fontSize: 12, marginTop: 8 }}>
            已达上限 {MAX_INVITES} 个,新码用完可以等朋友来帮你消耗 🙂
          </p>
        )}
      </div>

      {invites.length === 0 ? (
        <EmptyState variant="invite" />
      ) : (
        <ul className="post-list">
          {invites.map((inv) => {
            const shareLink = `/register?invite=${encodeURIComponent(inv.code)}`;
            const remaining = Math.max(0, inv.maxUses - inv.usedCount);
            const exhausted = remaining === 0;
            return (
              <li key={inv.id} className="post-item" style={{ minHeight: 0, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <code
                      style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: 15,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        background: "var(--brand-soft)",
                        padding: "2px 8px",
                        borderRadius: 6,
                      }}
                    >
                      {inv.code}
                    </code>
                    {exhausted && (
                      <span className="topic-badge" style={{ background: "var(--line-soft)" }}>
                        已用完
                      </span>
                    )}
                  </div>
                  <div className="post-meta">
                    <span>生成于 {formatDate(inv.createdAt)}</span>
                    <span>已用 {inv.usedCount}/{inv.maxUses}</span>
                    <span style={{ color: exhausted ? "var(--text-subtle)" : "var(--brand)" }}>
                      剩余 {remaining}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <CopyButton text={`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${shareLink}`} label="复制链接" />
                  <Link
                    href={shareLink}
                    style={{ fontSize: 12, color: "var(--brand)", fontWeight: 600 }}
                  >
                    打开 {inv.code}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="card" style={{ padding: 14 }}>
        <div className="quick-title" style={{ margin: 0 }}>
          小提示
        </div>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.9 }}>
          <li>邀请注册链接形如 <code style={{ background: "var(--line-soft)", padding: "1px 5px", borderRadius: 4 }}>/register?invite=CODE</code></li>
          <li>每个邀请码最多被使用 {invites[0]?.maxUses ?? 5} 次</li>
          <li>被邀请人注册成功,邀请人自动获得 10 积分</li>
        </ul>
      </div>
    </div>
  );
}