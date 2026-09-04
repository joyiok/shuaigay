import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { threadHref } from "@/lib/slug";
import { siteUrl } from "@/lib/site";
import { updateBioAction, toggleFollowAction } from "@/app/actions/user";
import { isAdmin } from "@/lib/permissions";
import { toggleFavoriteAction } from "@/app/actions/favorites";
import AvatarUploader from "@/components/AvatarUploader";
import UserAvatar from "@/components/UserAvatar";
import EmptyState from "@/components/EmptyState";
import AuthRequired from "@/components/AuthRequired";
import HumanizedFeedback from "@/components/HumanizedFeedback";
import { changePasswordAction } from "@/app/actions/auth";
import LevelBadge from "@/components/LevelBadge";
import { catToneClass } from "@/lib/format";
import { levelForPoints, nextLevelForPoints, permsForPoints, LEVELS } from "@/lib/levels";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const user = await db.user.findUnique({ where: { username }, select: { username: true, bio: true, createdAt: true } }).catch(() => null);
  if (!user) return { title: "用户不存在" };
  const base = siteUrl().origin;
  const url = `${base}/u/${encodeURIComponent(username)}`;
  const description = user.bio?.slice(0, 80) || `${username} — SHUAI GAY 论坛用户主页。`;
  return {
    title: `${username} 的主页`,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${username} - SHUAI GAY 社区`, description, url, type: "profile", siteName: "SHUAI GAY 社区", locale: "zh_CN" },
    twitter: { card: "summary", title: `${username} - SHUAI GAY`, description },
  };
}

type Tab = "topics" | "replies" | "favs";

function excerpt(raw: string): string {
  return raw.replace(/[#*_`>[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
}

function avatarSrc(stored: string | null | undefined): string | null {
  if (!stored) return null;
  return `/api/avatar?file=${encodeURIComponent(stored)}`;
}

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string; error?: string; ok?: string }>;
}) {
  const { username } = await params;
  const { tab: rawTab, error, ok } = await searchParams;
  const _tab = rawTab === "replies" ? "replies" : rawTab === "favs" ? "favs" : "topics";
  // 收藏仅本人可见
  const meEarly = await getCurrentUser();
  const tab: Tab = _tab === "favs" && meEarly?.id !== (await db.user.findUnique({ where: { username }, select: { id: true } }).then((u) => u?.id)) ? "topics" : (_tab as Tab);

  const user = await db.user.findUnique({
    where: { username },
    include: { _count: { select: { threads: true, posts: true, favorites: true } as unknown as { threads: true; posts: true } } },
  });
  if (!user) notFound();
  // _count.favorites may be missing type-wise — fetch separately when needed
  const favCount = await db.favorite.count({ where: { userId: user.id } }).catch(() => 0);
  const me = meEarly;
  const isSelf = me?.id === user.id;
  const userMedals = await db.userMedal.findMany({ where: { userId: user.id }, include: { medal: true } }).catch(() => [] as any[]);
  const ipLogs = me && isAdmin(me) ? await db.userIpLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }).catch(() => [] as any[]) : [];

  // 主题 Tab:最近发的主题
  const threads =
    tab === "topics"
      ? await db.thread.findMany({
          where: { authorId: user.id },
          orderBy: { lastPostAt: "desc" },
          take: 30,
          include: {
            board: { select: { slug: true, name: true } },
            _count: { select: { posts: true } },
          },
        })
      : [];

  // 回复 Tab:最近的帖子(含主题帖,用主题首帖 id 区分)
  const posts =
    tab === "replies"
      ? await db.post.findMany({
          where: { authorId: user.id },
          orderBy: { createdAt: "desc" },
          take: 30,
          include: {
            thread: {
              select: {
                id: true,
                title: true,
                board: { select: { slug: true, name: true } },
              },
            },
          },
        })
      : [];

  const favorites =
    tab === "favs" && isSelf
      ? await db.favorite.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 30,
          include: {
            thread: {
              select: {
                id: true,
                title: true,
                pinned: true,
                locked: true,
                lastPostAt: true,
                category: { select: { name: true } },
                board: { select: { slug: true, name: true } },
                _count: { select: { posts: true } },
              },
            },
          },
        })
      : [];

  // 关注关系:是否已关注 + 关注/粉丝数 + 最近粉丝列表
  const [isFollowing, followerCount, followingCount, followers] = me
    ? await Promise.all([
        db.follow
          .findUnique({
            where: { followerId_followingId: { followerId: me.id, followingId: user.id } },
            select: { id: true },
          })
          .then((f) => !!f)
          .catch(() => false),
        db.follow.count({ where: { followingId: user.id } }).catch(() => 0),
        db.follow.count({ where: { followerId: user.id } }).catch(() => 0),
        db.follow.findMany({
          where: { followingId: user.id },
          orderBy: { createdAt: "desc" },
          take: 8,
          include: { follower: { select: { id: true, username: true, avatarUrl: true } } },
        }),
      ])
    : [false, await db.follow.count({ where: { followingId: user.id } }).catch(() => 0), await db.follow.count({ where: { followerId: user.id } }).catch(() => 0), []];

  const firstPostIds = new Set<string>();
  if (posts.length) {
    const threadIds = [...new Set(posts.map((p) => p.threadId))];
    const firsts = await db.post.findMany({
      where: { threadId: { in: threadIds } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, threadId: true },
    });
    const seen = new Set<string>();
    for (const fp of firsts) {
      if (!seen.has(fp.threadId)) {
        seen.add(fp.threadId);
        firstPostIds.add(fp.id);
      }
    }
  }

  const avatarLetter = user.username.slice(0, 1).toUpperCase();
  const avSrc = avatarSrc(user.avatarUrl);
  const siteOrigin = siteUrl().origin;
  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: { "@type": "Person", name: user.username, description: user.bio ?? "", url: `${siteOrigin}/u/${encodeURIComponent(user.username)}` },
    dateCreated: user.createdAt.toISOString(),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: siteOrigin },
      { "@type": "ListItem", position: 2, name: user.username, item: `${siteOrigin}/u/${encodeURIComponent(user.username)}` },
    ],
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{user.username}</span>
      </div>

      {/* 资料卡 */}
      <div className="card user-profile-card" style={{ padding: 18 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div className="user-avatar-big" style={{ width: 56, height: 56, fontSize: 20, overflow: "hidden" }}>
            {avSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avSrc} alt={user.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              avatarLetter
            )}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{user.username}</h1>
              <LevelBadge points={user.points} role={user.role} />
              {userMedals.map((um: any) => (
                <span key={um.id} title={`${um.medal.name}${um.reason ? " · " + um.reason : ""} · ${um.medal.description ?? ""}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: um.medal.color, border: "1.5px solid var(--line)", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, boxShadow: "1px 1px 0 var(--line)" }}>
                  <span>{um.medal.icon}</span>{um.medal.name}
                </span>
              ))}
              {isSelf && (
                <Link
                  href="/invite"
                  style={{ fontSize: 12, color: "var(--brand)", fontWeight: 600 }}
                >
                  我的邀请 →
                </Link>
              )}
              {!isSelf && me && (
                <>
                  <Link
                    href={`/messages/${encodeURIComponent(user.username)}`}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      height: 28,
                      padding: "0 12px",
                      display: "inline-flex",
                      alignItems: "center",
                      background: "var(--brand)",
                      color: "#fff",
                      borderRadius: 999,
                      border: "1px solid var(--brand)",
                    }}
                  >
                    发私信
                  </Link>
                  <form action={toggleFollowAction}>
                    <input type="hidden" name="username" value={user.username} />
                    <button
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        height: 28,
                        padding: "0 12px",
                        display: "inline-flex",
                        alignItems: "center",
                        borderRadius: 999,
                        border: `1px solid ${isFollowing ? "var(--line)" : "var(--brand)"}`,
                        background: isFollowing ? "var(--panel)" : "var(--brand)",
                        color: isFollowing ? "var(--text-muted)" : "#fff",
                      }}
                    >
                      {isFollowing ? "✓ 已关注" : "+ 关注"}
                    </button>
                  </form>
                </>
              )}
              {!isSelf && !me && (
                <Link
                  href={`/login?next=${encodeURIComponent(`/u/${encodeURIComponent(user.username)}`)}`}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    height: 28,
                    padding: "0 12px",
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: 999,
                    border: "1px solid var(--line)",
                    background: "var(--panel)",
                    color: "var(--text-muted)",
                  }}
                >
                  + 关注
                </Link>
              )}
            </div>
            <p
              style={{
                margin: "6px 0 0",
                color: user.bio ? "var(--text-muted)" : "var(--text-subtle)",
                fontSize: 13,
                lineHeight: 1.7,
                maxWidth: 560,
              }}
            >
              {user.bio || "这个人很懒,什么都没写"}
            </p>
            <div className="post-meta" style={{ marginTop: 10, gap: 16 }}>
              <span style={{ fontWeight: 700, color: "var(--text)" }}>
                <span style={{ color: "var(--text-subtle)", fontWeight: 400 }}>积分 </span>
                {user.points}
              </span>
              {me && isAdmin(me) && (
                <span style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace", background: "var(--bg-soft)", border: "1px solid var(--line-soft)", padding: "1px 6px", borderRadius: 999 }}>
                  注册IP: {user.registrationIp ?? "—"} · 末登IP: {user.lastLoginIp ?? "—"}
                </span>
              )}
              <span>
                <span style={{ color: "var(--text-subtle)" }}>主题 </span>
                <strong>{user._count.threads}</strong>
              </span>
              <span>
                <span style={{ color: "var(--text-subtle)" }}>回复 </span>
                <strong>{Math.max(0, user._count.posts - user._count.threads)}</strong>
              </span>
              <span style={{ color: "var(--text-subtle)" }}>注册于 {formatDate(user.createdAt)}</span>
              <span>
                <span style={{ color: "var(--text-subtle)" }}>关注 </span>
                <strong>{followingCount}</strong>
              </span>
              <span>
                <span style={{ color: "var(--text-subtle)" }}>粉丝 </span>
                <strong>{followerCount}</strong>
              </span>
            </div>
            {/* 等级进度 */}
            {(() => {
              const lv = levelForPoints(user.points);
              const next = nextLevelForPoints(user.points);
              const perms = permsForPoints(user.points);
              const pct = next ? Math.max(5, Math.min(100, Math.round(((user.points - lv.min) / (next.missing + (user.points - lv.min))) * 100))) : 100;
              return (
                <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-soft)", border: "1.5px solid var(--line-soft)", borderRadius: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                    <span>{lv.name} · {user.points} 分</span>
                    <span>{next ? `距 ${next.name} 还差 ${next.missing} 分` : "已满级"}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--panel)", border: "1px solid var(--line-soft)", borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: lv.color, borderRadius: 999, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 10, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace" }}>
                    <span style={{ background: "var(--panel)", border: "1px solid var(--line)", padding: "2px 6px", borderRadius: 999 }}>日发帖 {perms.dailyThreads}</span>
                    <span style={{ background: "var(--panel)", border: "1px solid var(--line)", padding: "2px 6px", borderRadius: 999 }}>日回帖 {perms.dailyReplies}</span>
                    <span style={{ background: perms.canPostLink ? "var(--panel)" : "#FFF1F0", border: "1px solid var(--line)", padding: "2px 6px", borderRadius: 999, color: perms.canPostLink ? "var(--text)" : "var(--danger)" }}>{perms.canPostLink ? "可发外链" : "外链需审核"}</span>
                    <span style={{ background: "var(--panel)", border: "1px solid var(--line)", padding: "2px 6px", borderRadius: 999 }}>附件 {perms.maxUploadMB}MB</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* 本人可更换头像 */}
        {isSelf && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>头像设置</div>
            <AvatarUploader username={user.username} initialUrl={avSrc} />
          </div>
        )}

        {/* 管理员可见 IP 轨迹 */}
        {me && isAdmin(me) && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-soft)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace", marginBottom: 6 }}>IP 轨迹 · 仅管理员可见</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", background: "var(--bg-soft)", border: "1px solid var(--line-soft)", borderRadius: 8, padding: "8px 10px" }}>
              注册: {user.registrationIp ?? "—"} · 末登: {user.lastLoginIp ?? "—"} {user.lastLoginAt ? `(${new Date(user.lastLoginAt).toLocaleString("zh-CN")})` : ""} · 末活跃: {user.lastActiveIp ?? "—"}
            </div>
            {ipLogs.length > 0 && (
              <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                {ipLogs.map((log: any) => (
                  <div key={log.id} style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", display: "flex", gap: 8, justifyContent: "space-between", background: "var(--panel)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: "4px 8px" }}>
                    <span>{log.ip}</span><span>{log.action}</span><span>{new Date(log.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 本人操作反馈：改密成功/失败 */}
        {isSelf && (error === "wrong_password" || error === "same_password" || error === "invalid") && (
          <div style={{ marginTop: 14 }}>
            <HumanizedFeedback
              type="error"
              title={error === "wrong_password" ? "原密码不对" : error === "same_password" ? "新旧一样" : "格式不对"}
              message={error === "wrong_password" ? "原密码没对上，改密失败。" : error === "same_password" ? "新密码和原密码相同，换一个。" : "新密码 8-72 位，检查下再试。"}
              suggestion={error === "wrong_password" ? "忘了就走忘记密码邮件" : "再想一个"}
            />
          </div>
        )}
        {isSelf && ok === "password_changed" && (
          <div style={{ marginTop: 14 }}>
            <HumanizedFeedback type="success" title="密码已换好" message="其它设备已下线，本机继续用。" suggestion="新密码记牢" />
          </div>
        )}

        {/* 本人可编辑 bio / 未登录提示 */}
        {isSelf ? (
          <>
          <form
            action={updateBioAction}
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid var(--line-soft)",
              display: "grid",
              gap: 8,
            }}
          >
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
              个人简介(最多 200 字)
            </label>
            <textarea
              name="bio"
              maxLength={200}
              rows={2}
              placeholder="介绍一下自己"
              defaultValue={user.bio ?? ""}
              style={{
                width: "100%",
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "10px 12px",
                fontSize: 13,
                outline: "none",
                resize: "vertical",
              }}
            />
            <div>
              <button
                type="submit"
                style={{
                  height: 30,
                  padding: "0 14px",
                  background: "var(--brand)",
                  color: "#fff",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  border: "1px solid var(--brand)",
                }}
              >
                保存
              </button>
            </div>
          </form>

          {/* 本人自助改密码：验原密码 + 踢其它会话 */}
          <form
            action={changePasswordAction}
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid var(--line-soft)",
              display: "grid",
              gap: 8,
            }}
          >
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
              修改密码(改后其它设备下线)
            </label>
            <input
              type="password"
              name="currentPassword"
              placeholder="原密码"
              autoComplete="current-password"
              required
              style={{
                width: "100%",
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 13,
                outline: "none",
              }}
            />
            <input
              type="password"
              name="newPassword"
              placeholder="新密码(8-72 位)"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
              style={{
                width: "100%",
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 13,
                outline: "none",
              }}
            />
            <div>
              <button
                type="submit"
                style={{
                  height: 30,
                  padding: "0 14px",
                  background: "var(--panel)",
                  color: "var(--text)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  border: "1px solid var(--line)",
                }}
              >
                换密码
              </button>
            </div>
          </form>
          </>
        ) : !me ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-soft)" }}>
            <AuthRequired title="登录后可编辑个人简介" description="当前为访客身份，登录后可修改头像、简介等个人信息。" next={`/u/${encodeURIComponent(user.username)}`} />
          </div>
        ) : null}
      </div>

      {/* 粉丝列表 */}
      {followerCount > 0 && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 3, height: 12, borderRadius: 999, background: "var(--brand)" }} />
            最近粉丝
            <span style={{ background: "var(--bg-soft)", border: "1px solid var(--line)", borderRadius: 999, padding: "1px 7px", fontSize: 11, color: "var(--text-subtle)", fontWeight: 600 }}>{followerCount}</span>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {followers.map((f) => (
              <Link
                key={f.follower.id}
                href={`/u/${encodeURIComponent(f.follower.username)}`}
                style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
              >
                <UserAvatar username={f.follower.username} avatarUrl={f.follower.avatarUrl} size={32} radius={9} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.follower.username}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="tab-bar" style={{ margin: 0 }}>
        <Link href={`/u/${encodeURIComponent(user.username)}`} className={`tab ${tab === "topics" ? "active" : ""}`}>
          主题 <span style={{ marginLeft: 4, opacity: 0.75 }}>{user._count.threads}</span>
        </Link>
        <Link href={`/u/${encodeURIComponent(user.username)}?tab=replies`} className={`tab ${tab === "replies" ? "active" : ""}`}>
          回复 <span style={{ marginLeft: 4, opacity: 0.75 }}>{Math.max(0, user._count.posts - user._count.threads)}</span>
        </Link>
        {isSelf && (
          <Link href={`/u/${encodeURIComponent(user.username)}?tab=favs`} className={`tab ${tab === "favs" ? "active" : ""}`}>
            收藏 <span style={{ marginLeft: 4, opacity: 0.75 }}>{favCount}</span>
          </Link>
        )}
      </div>

      {/* 主题列表 */}
      {tab === "topics" && (
        threads.length === 0 ? (
          <EmptyState variant="post" title="还没有发过主题" description="这个用户还没有发布任何主题，稍后再来看看。" actionLabel="去逛逛" actionHref="/" />
        ) : (
          <ul className="post-list">
            {threads.map((t) => (
              <li key={t.id} className="post-item">
                <div className="post-avatar" style={{ overflow: "hidden" }}>
                  {avSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avSrc} alt={user.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    avatarLetter
                  )}
                </div>
                <div className="post-body">
                  <div className="post-title-row">
                    {t.pinned && <span className="topic-badge pinned">置顶</span>}
                    {t.locked && <span className="topic-badge" style={{ background: "var(--line-soft)" }}>已锁</span>}
                    <Link href={threadHref(t.id, t.title)} prefetch={false} className="post-title">
                      {t.title}
                    </Link>
                  </div>
                  <div className="post-meta">
                    <span>
                      <svg className="meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                      </svg>
                      {Math.max(0, t._count.posts - 1)} 回复
                    </span>
                    <span>{formatDate(t.lastPostAt)}</span>
                  </div>
                </div>
                <Link href={`/c/${t.board.slug}`} className="post-tag">
                  {t.board.name}
                </Link>
              </li>
            ))}
          </ul>
        )
      )}

      {/* 回复列表 */}
      {tab === "replies" && (
        posts.length === 0 ? (
          <EmptyState variant="post" title="还没有回复过" description="这个用户还没有发表任何回复，去主题里逛逛吧。" actionLabel="查看主题" actionHref="/" />
        ) : (
          <ul className="post-list">
            {posts.map((p) => {
              const isFirst = firstPostIds.has(p.id);
              return (
                <li key={p.id} className="post-item" style={{ minHeight: 0 }}>
                  <div className="post-avatar" style={{ overflow: "hidden" }}>
                    {avSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avSrc} alt={user.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      avatarLetter
                    )}
                  </div>
                  <div className="post-body">
                    <div className="post-title-row">
                      {isFirst && <span className="topic-badge">主题帖</span>}
                      <Link href={threadHref(p.threadId, p.thread.title)} prefetch={false} className="post-title" style={{ fontSize: 13 }}>
                        {p.thread.title}
                      </Link>
                    </div>
                    <p
                      style={{
                        margin: "4px 0 0",
                        color: "var(--text-muted)",
                        fontSize: 12,
                        lineHeight: 1.6,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {excerpt(p.contentMd) || "(空)"}
                    </p>
                    <div className="post-meta" style={{ fontSize: 11, marginTop: 3 }}>
                      <span>{formatDate(p.createdAt)}</span>
                      <span style={{ color: "var(--text-subtle)" }}>{p.thread.board.name}</span>
                    </div>
                  </div>
                  <Link href={threadHref(p.threadId, p.thread.title)} prefetch={false} className="post-tag" style={{ fontSize: 11 }}>
                    查看
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      )}

      {tab === "favs" && isSelf && (
        favorites.length === 0 ? (
          <EmptyState variant="post" title="还没有收藏" description="收藏的主题会在这里显示，有新回复时会收到通知。" actionLabel="去逛逛" actionHref="/" />
        ) : (
          <ul className="post-list">
            {favorites.map((f) => (
              <li key={f.id} className="post-item">
                <div className="post-avatar" style={{ overflow: "hidden" }}>{avatarLetter}</div>
                <div className="post-body">
                  <div className="post-title-row" style={{ gap: 6 }}>
                    {f.thread.pinned && <span className="topic-badge pinned">置顶</span>}
                    {f.thread.locked && <span className="topic-badge" style={{ background: "var(--line-soft)" }}>已锁</span>}
                    {f.thread.category && <span className={`topic-badge ${catToneClass(f.thread.category.name)}`}>{f.thread.category.name}</span>}
                    <Link href={threadHref(f.thread.id, f.thread.title)} prefetch={false} className="post-title">{f.thread.title}</Link>
                  </div>
                  <div className="post-meta">
                    <span>{f.thread.board.name}</span>
                    <span>{Math.max(0, f.thread._count.posts - 1)} 回复</span>
                    <span>{formatDate(f.thread.lastPostAt)}</span>
                  </div>
                </div>
                <form action={toggleFavoriteAction}>
                  <input type="hidden" name="threadId" value={f.thread.id} />
                  <input type="hidden" name="next" value={`/u/${encodeURIComponent(user.username)}?tab=favs`} />
                  <button style={{ fontSize: 11, color: "var(--text-subtle)", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 8px", background: "var(--panel)" }}>取消收藏</button>
                </form>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
