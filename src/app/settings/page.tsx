import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { listBlocked } from "@/lib/block";
import { unblockUserAction } from "@/app/actions/block";
import { revokeOtherSessionsAction, revokeSessionAction, updateEmailAction, updateNotifyPrefsAction } from "@/app/actions/account";
import { formatDate } from "@/lib/format";
import { levelForPoints, nextLevelForPoints } from "@/lib/levels";
import { NOTIFY_GROUPS } from "@/lib/notifications";
import { updateBioAction, updateNotificationPrefsAction } from "@/app/actions/user";
import { changePasswordAction, resendVerificationAction } from "@/app/actions/auth";
import AuthRequired from "@/components/AuthRequired";
import AvatarUploader from "@/components/AvatarUploader";
import HumanizedFeedback from "@/components/HumanizedFeedback";
import LevelBadge from "@/components/LevelBadge";
import SettingsForm from "@/components/SettingsForm";
import SubmissionForm from "@/components/SubmissionForm";
import UserAvatar from "@/components/UserAvatar";

export const metadata: Metadata = {
  title: "账号设置",
  description: "管理头像、简介、密码、邮箱验证与通知偏好。",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const btnStyle: React.CSSProperties = { height: 34, padding: "0 16px", background: "var(--panel)", color: "var(--text)", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "1px solid var(--line)" };
const inputStyle = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  outline: "none",
  background: "var(--panel)",
  color: "var(--text)",
} as const;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--brand)" }} />
          {title}
        </h2>
        {description && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-subtle)", lineHeight: 1.7 }}>{description}</p>}
      </div>
      {children}
    </section>
  );
}

const PASSWORD_ERRORS: Record<string, { title: string; message: string; suggestion: string }> = {
  wrong_password: { title: "原密码不对", message: "原密码没对上，改密失败。", suggestion: "忘了就走忘记密码邮件" },
  same_password: { title: "新旧一样", message: "新密码和原密码相同，换一个。", suggestion: "再想一个" },
  ratelimited: { title: "手速太快", message: "改密尝试太频繁，歇会儿再试。", suggestion: "等一小时再来" },
  invalid: { title: "格式不对", message: "新密码 12 位以上，或 8 位+含 3 类字符，检查下再试。", suggestion: "换一个更强的密码" },
};

function deviceIcon(ua: string): string {
  const u = ua.toLowerCase();
  if (!ua) return "💻";
  if (/iphone|android.*mobile|windows phone/.test(u)) return "📱";
  if (/ipad|tablet/.test(u)) return "📟";
  if (/curl|wget|python|bot|http/.test(u)) return "🤖";
  return "💻";
}

function deviceName(ua: string): string {
  const u = ua.toLowerCase();
  if (!ua) return "未知设备";
  const browser = /edg\//.test(u) ? "Edge" : /chrome\//.test(u) ? "Chrome" : /safari\//.test(u) ? "Safari" : /firefox\//.test(u) ? "Firefox" : "浏览器";
  const os = /windows/.test(u) ? "Windows" : /iphone|ipad|ios/.test(u) ? "iOS" : /android/.test(u) ? "Android" : /mac os/.test(u) ? "macOS" : /linux/.test(u) ? "Linux" : "";
  return os ? `${os} · ${browser}` : browser;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const me = await getCurrentUser();
  const sp = await searchParams;

  if (!me) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="breadcrumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>账号设置</span>
        </div>
        <h1 className="page-heading">账号设置</h1>
        <AuthRequired title="登录后管理账号" description="头像、简介、密码、邮箱验证与通知偏好都在这里设置。" next="/settings" />
      </div>
    );
  }

  const user = await db.user.findUnique({
    where: { id: me.id },
    select: {
      username: true,
      email: true,
      emailVerified: true,
      role: true,
      points: true,
      bio: true,
      avatarUrl: true,
      notifyReply: true,
      notifyFollow: true,
      emailNotify: true,
      createdAt: true,
      _count: { select: { threads: true, posts: true, favorites: true } },
    },
  });
  if (!user) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="breadcrumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>账号设置</span>
        </div>
        <h1 className="page-heading">账号设置</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>账号状态异常，请重新登录后再试。</p>
      </div>
    );
  }

  // 登录设备：当前会话用 cookie token 反查
  const currentToken = (await cookies()).get("session")?.value ?? "";
  const currentHash = currentToken ? createHash("sha256").update(currentToken).digest("hex") : "";
  const sessionRows = await db.session
    .findMany({
      where: { userId: me.id, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      take: 20,
      select: { id: true, ip: true, ua: true, createdAt: true, lastSeenAt: true, tokenHash: true },
    })
    .catch(() => []);
  const sessions = sessionRows.map((s) => ({
    id: s.id,
    ip: s.ip,
    ua: s.ua ?? "",
    createdAt: s.createdAt.toLocaleString("zh-CN", { hour12: false }),
    lastSeenAt: s.lastSeenAt.toLocaleString("zh-CN", { hour12: false }),
    current: s.tokenHash === currentHash,
  }));
  const blocked = await listBlocked(me.id);

  // 等级展示走后台配置的 ladder
  const { getLadder } = await import("@/lib/levels");
  const ladder = await getLadder().catch(() => undefined);
  const lv = levelForPoints(user.points, ladder);
  const next = nextLevelForPoints(user.points, ladder);
  const pwError = sp.error ? PASSWORD_ERRORS[sp.error] : undefined;
  const prefs: Record<string, boolean> = { reply: user.notifyReply, follow: user.notifyFollow };

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>账号设置</span>
      </div>
      <h1 className="page-heading">账号设置</h1>

      {/* 账号概览 */}
      <Section title="账号概览" description="账号名与注册邮箱不可自行修改；需要变更请联系管理员。">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={52} radius={14} />
          <div style={{ flex: 1, minWidth: 220, display: "grid", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15 }}>{user.username}</strong>
              <LevelBadge points={user.points} role={user.role} />
              {user.emailVerified ? (
                <span className="chip-success">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2.5 6.4 5 8.8l4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  邮箱已验证
                </span>
              ) : (
                <span className="chip-warn">邮箱未验证</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-subtle)", display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>{user.email}</span>
              <span>{lv.name} · {user.points} 分{next ? `（距 ${next.name} 还差 ${next.missing} 分）` : "（已满级）"}</span>
              <span>注册于 {formatDate(user.createdAt)}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-subtle)", display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>主题 {user._count.threads}</span>
              <span>回帖 {Math.max(0, user._count.posts - user._count.threads)}</span>
              <span>收藏 {user._count.favorites}</span>
            </div>
          </div>
          <Link
            href={`/u/${encodeURIComponent(user.username)}`}
            style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 12px", background: "var(--panel)" }}
          >
            查看主页 →
          </Link>
        </div>
      </Section>

      {/* 邮箱验证 */}
      {!user.emailVerified && (
        <Section title="验证邮箱" description="验证后能正常接收回复提醒与找回密码邮件。没收到可重新发送，结果会跳转到验证页提示。">
          <form action={resendVerificationAction}>
            <button
              type="submit"
              style={{ height: 34, padding: "0 16px", background: "var(--brand)", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "1px solid var(--brand)" }}
            >
              重新发送验证邮件
            </button>
          </form>
        </Section>
      )}

      {/* 修改密码 */}
      <Section title="修改密码" description="改完其它设备会自动下线，本机保持登录。">
        {sp.ok === "password_changed" && (
          <HumanizedFeedback type="success" title="密码已换好" message="其它设备已下线，本机继续用。" suggestion="新密码记牢" />
        )}
        {pwError && <HumanizedFeedback type="error" title={pwError.title} message={pwError.message} suggestion={pwError.suggestion} />}
        <SubmissionForm action={changePasswordAction} style={{ display: "grid", gap: 8 }}>
          <input type="hidden" name="next" value="/settings" />
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>原密码</span>
            <input type="password" name="currentPassword" autoComplete="current-password" required style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>新密码</span>
            <input type="password" name="newPassword" autoComplete="new-password" minLength={8} maxLength={72} required style={inputStyle} />
            <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>12 位以上最省事，或 8 位以上且包含大小写/数字/符号中的 3 类。</span>
          </label>
          <div>
            <button type="submit" style={{ height: 34, padding: "0 16px", background: "var(--panel)", color: "var(--text)", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "1px solid var(--line)" }}>
              保存新密码
            </button>
          </div>
        </SubmissionForm>
      </Section>

      {/* 通知偏好 */}
      <Section title="通知偏好" description="关掉后站内不再生成该类通知；待审、举报、系统公告等运营通知不受影响。">
        {sp.ok === "notify_saved" && <HumanizedFeedback type="success" title="通知偏好已保存" message="之后按新的设置给你发提醒。" autoDismiss={5000} />}
        <SettingsForm action={updateNotificationPrefsAction} next="/settings?ok=notify_saved" style={{ display: "grid", gap: 10 }}>
          {NOTIFY_GROUPS.map((g) => (
            <label
              key={g.key}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "11px 12px",
                border: "1px solid var(--line-soft)",
                borderRadius: 10,
                background: "var(--bg-soft)",
                cursor: "pointer",
              }}
            >
              <input type="checkbox" name={g.key} defaultChecked={prefs[g.key]} style={{ marginTop: 3, accentColor: "var(--brand)", width: 16, height: 16 }} />
              <span style={{ display: "grid", gap: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{g.label}</span>
                <span style={{ fontSize: 12, color: "var(--text-subtle)", lineHeight: 1.7 }}>{g.description}</span>
              </span>
            </label>
          ))}
          <div>
            <button type="submit" style={{ height: 34, padding: "0 16px", background: "var(--brand)", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "1px solid var(--brand)" }}>
              保存通知偏好
            </button>
          </div>
        </SettingsForm>
      </Section>

      {/* 个人资料 */}
      <Section title="个人资料" description="头像和简介会展示在主题、回复与个人主页上。">
        <AvatarUploader username={user.username} initialUrl={user.avatarUrl ? `/api/avatar?file=${encodeURIComponent(user.avatarUrl)}` : null} />
        <SettingsForm action={updateBioAction} next={`/u/${encodeURIComponent(user.username)}?ok=bio_saved`} style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>个人简介（最多 200 字）</span>
            <textarea name="bio" maxLength={200} rows={3} defaultValue={user.bio ?? ""} placeholder="介绍一下自己" style={{ ...inputStyle, resize: "vertical" }} />
          </label>
          <div>
            <button type="submit" style={{ height: 34, padding: "0 16px", background: "var(--panel)", color: "var(--text)", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "1px solid var(--line)" }}>
              保存简介
            </button>
          </div>
        </SettingsForm>
      </Section>

      {/* 换绑邮箱 */}
      <Section title="换绑邮箱" description="换绑需要到新邮箱点确认链接才生效；旧邮箱会收到一封提醒邮件。当前邮箱是找回密码的唯一通道，请填常用邮箱。">
        {sp.ok === "email_sent" && (
          <HumanizedFeedback type="success" title="确认邮件已发送" message="请到新邮箱点击确认链接完成换绑。" autoDismiss={8000} />
        )}
        {sp.ok === "email_changed" && (
          <HumanizedFeedback type="success" title="邮箱已更新" message="之后请用新邮箱登录与找回密码。" autoDismiss={8000} />
        )}
        {sp.error === "email_taken" && <HumanizedFeedback type="error" title="这个邮箱已被占用" message="换一个邮箱，或先用该邮箱找回原账号。" />}
        {sp.error === "email_same" && <HumanizedFeedback type="error" title="邮箱没变" message="新邮箱与当前邮箱相同。" />}
        {sp.error === "email_invalid" && <HumanizedFeedback type="error" title="邮箱格式不对" message="检查一下再提交。" />}
        {sp.error === "email_ratelimited" && <HumanizedFeedback type="error" title="提交太频繁" message="每小时最多发起 3 次换绑，请稍后再试。" />}
        <SettingsForm action={updateEmailAction} next="/settings" style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>新邮箱</span>
            <input name="newEmail" type="email" required placeholder="you@example.com" style={inputStyle} autoComplete="email" />
          </label>
          <div>
            <button type="submit" style={btnStyle}>发送确认邮件</button>
          </div>
        </SettingsForm>
      </Section>

      {/* 邮件提醒 */}
      <Section title="邮件提醒" description="开启后，有人回复你、@你或给你发私信时，若你不在线会收到一封邮件。默认关闭。">
        <SettingsForm action={updateNotifyPrefsAction} next="/settings?ok=notify_saved" style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13 }}>
            <input type="checkbox" name="emailNotify" defaultChecked={Boolean((me as any).emailNotify)} style={{ marginTop: 3 }} />
            <span>
              <strong>有人回复 / @我 / 私信我时发邮件</strong>
              <span style={{ display: "block", color: "var(--text-subtle)", fontSize: 12, marginTop: 2 }}>
                同一人 10 分钟内只发一封；在线时只发站内通知，不发邮件。
              </span>
            </span>
          </label>
          <div>
            <button type="submit" style={btnStyle}>保存邮件偏好</button>
          </div>
        </SettingsForm>
      </Section>

      {/* 登录设备 */}
      <Section title="登录设备" description="查看当前登录的会话，发现陌生设备可立即下线（改密码会下线全部其它设备）。">
        <div style={{ display: "grid", gap: 8 }}>
          {sessions.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: "1px solid var(--line-soft)", borderRadius: 10, background: "var(--bg-soft)", flexWrap: "wrap" }}>
              <span style={{ fontSize: 15 }} aria-hidden>{deviceIcon(s.ua)}</span>
              <span style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                  {deviceName(s.ua)}
                  {s.current && <span className="topic-badge" style={{ marginLeft: 8, background: "var(--brand-soft)", color: "var(--brand)", border: "none", fontWeight: 800 }}>当前设备</span>}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text-subtle)", fontFamily: "var(--font-jet)" }}>
                  {s.ip || "未知 IP"} · 登录于 {s.createdAt} · 最近活跃 {s.lastSeenAt}
                </span>
              </span>
              {!s.current && (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <button type="submit" style={{ fontSize: 12, fontWeight: 700, height: 28, padding: "0 12px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--danger)", cursor: "pointer" }}>
                    下线
                  </button>
                </form>
              )}
            </div>
          ))}
          {sessions.length === 0 && <span style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>没有可显示的会话。</span>}
        </div>
        {sessions.length > 1 && (
          <form action={revokeOtherSessionsAction}>
            <button type="submit" style={btnStyle}>下线其它所有设备</button>
          </form>
        )}
      </Section>

      {/* 屏蔽管理 */}
      <Section title="屏蔽管理" description="被你屏蔽的人：你俩互相看不到回帖与私信，也不会收到对方通知。">
        {blocked.length === 0 ? (
          <span style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>还没有屏蔽任何人。在用户主页可以屏蔽。</span>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {blocked.map((b) => (
              <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 999, background: "var(--panel)", fontSize: 12.5 }}>
                <UserAvatar username={b.target.username} avatarUrl={b.target.avatarUrl} size={20} radius={6} />
                <Link href={`/u/${encodeURIComponent(b.target.username)}`} style={{ color: "var(--text)", fontWeight: 600 }}>{b.target.username}</Link>
                <form action={unblockUserAction}>
                  <input type="hidden" name="targetId" value={b.target.id} />
                  <input type="hidden" name="back" value="/settings" />
                  <button type="submit" style={{ fontSize: 11.5, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
                    解除
                  </button>
                </form>
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* 快捷入口 */}
      <Section title="快捷入口">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { href: `/u/${encodeURIComponent(user.username)}?tab=favs`, label: "我的收藏" },
            { href: "/drafts", label: "草稿箱" },
            { href: "/invite", label: "我的邀请" },
            { href: "/messages", label: "私信" },
            { href: "/notifications", label: "通知" },
            { href: "/members", label: "会员目录" },
            { href: "/forgot", label: "忘记密码流程" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", border: "1px solid var(--line)", borderRadius: 999, padding: "7px 14px", background: "var(--panel)" }}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
