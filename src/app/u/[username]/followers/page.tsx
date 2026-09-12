import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { levelForPoints } from "@/lib/levels";
import { toggleFollowAction } from "@/app/actions/user";
import ActionToggle from "@/components/ActionToggle";
import EmptyState from "@/components/EmptyState";
import LevelBadge from "@/components/LevelBadge";
import UserAvatar from "@/components/UserAvatar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

type Tab = "followers" | "following";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const user = await db.user
    .findUnique({ where: { username }, select: { username: true } })
    .catch(() => null);
  if (!user) return { title: "用户不存在" };
  return {
    title: `${username} 的关注与粉丝`,
    description: `查看 ${username} 关注的人和关注 TA 的人 — SHUAI GAY 社区。`,
    robots: { index: false, follow: true },
  };
}

interface Row {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  points: number;
  role: string;
  createdAt: Date;
  following: boolean;
}

export default async function FollowersPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
  const tab: Tab = sp.tab === "following" ? "following" : "followers";
  const page = Math.max(1, Number(sp.page) || 1);

  const user = await db.user.findUnique({
    where: { username },
    select: { id: true, username: true, avatarUrl: true },
  });
  if (!user) notFound();

  const me = await getCurrentUser();
  const base = `/u/${encodeURIComponent(user.username)}`;
  // 等级 ladder 走后台配置（单次读，行内展示闭包复用）
  const { getLadder } = await import("@/lib/levels");
  const ladder = await getLadder().catch(() => undefined);

  const [followerCount, followingCount] = await Promise.all([
    db.follow.count({ where: { followingId: user.id } }).catch(() => 0),
    db.follow.count({ where: { followerId: user.id } }).catch(() => 0),
  ]);

  const select = {
    username: true,
    avatarUrl: true,
    bio: true,
    points: true,
    role: true,
    createdAt: true,
  } as const;

  const relations =
    tab === "followers"
      ? await db.follow.findMany({
          where: { followingId: user.id },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: { follower: { select } },
        })
      : await db.follow.findMany({
          where: { followerId: user.id },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: { following: { select } },
        });

  const people = relations.map((r) => ("follower" in r ? r.follower : r.following));
  const ids = people.map((p) => p.username);
  // 一次查出「我」关注了列表里的谁，避免每行一次查询
  const myFollowing = me
    ? new Set(
        (
          await db.follow
            .findMany({
              where: { followerId: me.id, following: { username: { in: ids } } },
              select: { following: { select: { username: true } } },
            })
            .catch(() => [] as { following: { username: string } }[])
        ).map((f) => f.following.username),
      )
    : new Set<string>();

  const rows: Row[] = people.map((p) => ({ ...p, following: myFollowing.has(p.username) }));

  const total = tab === "followers" ? followerCount : followingCount;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabHref = (t: Tab) => (t === "following" ? `${base}/followers?tab=following` : `${base}/followers`);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <Link href={base}>{user.username}</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>关注与粉丝</span>
      </div>

      <div className="card" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={44} radius={12} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{user.username} 的社交圈</h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-subtle)" }}>
            粉丝 {followerCount} · 关注 {followingCount}
          </p>
        </div>
        <Link
          href={base}
          style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 12px", background: "var(--panel)" }}
        >
          返回主页 →
        </Link>
      </div>

      <div className="tab-bar" style={{ margin: 0 }}>
        <Link href={tabHref("followers")} className={`tab ${tab === "followers" ? "active" : ""}`}>
          粉丝 <span style={{ marginLeft: 4, opacity: 0.75 }}>{followerCount}</span>
        </Link>
        <Link href={tabHref("following")} className={`tab ${tab === "following" ? "active" : ""}`}>
          关注 <span style={{ marginLeft: 4, opacity: 0.75 }}>{followingCount}</span>
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          variant="default"
          title={tab === "followers" ? "还没有粉丝" : "还没有关注任何人"}
          description={tab === "followers" ? "等第一个同好来关注吧，多发帖更容易被看到。" : "去逛逛主题，遇到聊得来的人就点个关注。"}
          actionLabel="去首页看看"
          actionHref="/"
        />
      ) : (
        <ul className="post-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {rows.map((p) => (
            <li
              key={p.username}
              className="post-item"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}
            >
              <Link href={`/u/${encodeURIComponent(p.username)}`} style={{ display: "inline-flex", flexShrink: 0 }}>
                <UserAvatar username={p.username} avatarUrl={p.avatarUrl} size={40} radius={11} />
              </Link>
              <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Link href={`/u/${encodeURIComponent(p.username)}`} style={{ fontWeight: 700, fontSize: 13 }}>
                    {p.username}
                  </Link>
                  <LevelBadge points={p.points} role={p.role} ladder={ladder} />
                  <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>
                    {levelForPoints(p.points, ladder).name} · {p.points} 分
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.bio || "这个人很懒，什么都没写"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>加入于 {formatDate(p.createdAt)}</div>
              </div>
              {me && me.username !== p.username && (
                <div style={{ flexShrink: 0 }}>
                  <ActionToggle
                    action={toggleFollowAction}
                    fields={{ username: p.username }}
                    active={p.following}
                    label="+ 关注"
                    activeLabel="✓ 已关注"
                    pendingLabel="处理中…"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      height: 30,
                      padding: "0 14px",
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: 999,
                      border: `1px solid ${p.following ? "var(--line)" : "var(--brand)"}`,
                      background: p.following ? "var(--panel)" : "var(--brand)",
                      color: p.following ? "var(--text-muted)" : "#fff",
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="tab-bar" aria-label="分页" style={{ justifyContent: "center" }}>
          {page > 1 && (
            <Link className="tab" href={`${tabHref(tab)}${tab === "following" ? "&" : "?"}page=${page - 1}`}>
              上一页
            </Link>
          )}
          <span style={{ fontSize: 12, color: "var(--text-subtle)", padding: "0 8px" }}>
            第 {page} / {totalPages} 页
          </span>
          {page < totalPages && (
            <Link className="tab" href={`${tabHref(tab)}${tab === "following" ? "&" : "?"}page=${page + 1}`}>
              下一页
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
