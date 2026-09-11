import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import AuthRequired from "@/components/AuthRequired";
import UserAvatar from "@/components/UserAvatar";
import EmptyState from "@/components/EmptyState";
import { formatDate, catToneClass } from "@/lib/format";
import { threadHref } from "@/lib/slug";
import { getRecentReading } from "@/lib/reading-progress";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "关注与追更",
  description: "关注的人发了什么、追更的作品更新到第几章、以及你上次读到哪儿。",
  robots: { index: false, follow: false },
};

export default async function FollowingPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <AuthRequired
        title="登录后查看关注动态"
        description="关注的人发新帖、追更的作品更新，都会汇总到这里。"
        next="/following"
      />
    );
  }

  const [follows, favorites, reading] = await Promise.all([
    db.follow.findMany({ where: { followerId: user.id }, select: { followingId: true } }),
    db.favorite.findMany({
      where: { userId: user.id, thread: { status: "approved", board: { isHidden: false } } },
      select: {
        lastSeenPosts: true,
        createdAt: true,
        thread: {
          select: {
            id: true,
            title: true,
            lastPostAt: true,
            board: { select: { slug: true, name: true } },
            author: { select: { username: true } },
            _count: { select: { posts: true } },
          },
        },
      },
    }),
    getRecentReading(user.id, 6),
  ]);

  const followingIds = follows.map((f) => f.followingId);
  const followedThreads = followingIds.length
    ? await db.thread.findMany({
        where: { authorId: { in: followingIds }, status: "approved", board: { isHidden: false } },
        orderBy: [{ lastPostAt: "desc" }, { id: "desc" }],
        take: 25,
        select: {
          id: true,
          title: true,
          lastPostAt: true,
          category: { select: { name: true } },
          author: { select: { username: true, avatarUrl: true } },
          board: { select: { slug: true, name: true } },
          _count: { select: { posts: true } },
        },
      })
    : [];

  // 追更里有更新的排前面
  const updates = favorites
    .map((f) => {
      const total = f.thread._count.posts;
      return { ...f, total, fresh: Math.max(0, total - f.lastSeenPosts) };
    })
    .filter((f) => f.fresh > 0)
    .sort((a, b) => b.thread.lastPostAt.getTime() - a.thread.lastPostAt.getTime());

  const quietFollowing = favorites
    .map((f) => ({ ...f, total: f.thread._count.posts }))
    .filter((f) => f.total - f.lastSeenPosts <= 0);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>关注与追更</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-subtle)" }}>
          共关注 {followingIds.length} 人 · 追更 {favorites.length} 部
        </p>
      </div>

      {/* 追更更新 */}
      <div className="card" style={{ padding: 16 }}>
        <div className="quick-title" style={{ margin: "0 0 10px" }}>
          追更更新 <span>{updates.length} 部有新章节</span>
        </div>
        {updates.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>
            追更的作品暂时没有新章节。在作品页点「☆ 追更」，有新章节时会在这里置顶提醒。
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {updates.map((f) => (
              <Link
                key={f.thread.id}
                href={threadHref(f.thread.id, f.thread.title)}
                prefetch={false}
                style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 10, background: "var(--bg-soft)", border: "1px solid var(--line-soft)", textDecoration: "none", color: "inherit" }}
              >
                <span className="novel-progress-chip fresh">+{f.fresh} 章</span>
                <span style={{ fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.thread.title}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text-subtle)", fontFamily: "var(--font-jet)" }}>
                  共 {f.total} 章 · {formatDate(f.thread.lastPostAt).split(" ")[0]}
                </span>
              </Link>
            ))}
          </div>
        )}
        {quietFollowing.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {quietFollowing.slice(0, 12).map((f) => (
              <Link
                key={f.thread.id}
                href={threadHref(f.thread.id, f.thread.title)}
                prefetch={false}
                style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 999, background: "var(--bg-soft)", border: "1px solid var(--line)", color: "var(--text-muted)", textDecoration: "none" }}
              >
                {f.thread.title.length > 14 ? `${f.thread.title.slice(0, 14)}…` : f.thread.title}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 最近在读 */}
      {reading.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="quick-title" style={{ margin: "0 0 10px" }}>最近在读</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {reading.map((r) => (
              <Link
                key={r.thread.id}
                href={r.postId ? `${threadHref(r.thread.id, r.thread.title)}#post-${r.postId}` : threadHref(r.thread.id, r.thread.title)}
                prefetch={false}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, padding: "5px 11px", borderRadius: 999, background: "var(--bg-soft)", border: "1px solid var(--line)", textDecoration: "none", color: "var(--text)" }}
              >
                <span style={{ fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.thread.title}</span>
                <span className="novel-progress-chip">第 {r.chapter} 章</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 关注的人的新帖 */}
      <div className="card" style={{ padding: 16 }}>
        <div className="quick-title" style={{ margin: "0 0 10px" }}>
          关注的人 <span>{followingIds.length} 人 · 最近发布</span>
        </div>
        {followingIds.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>
            还没有关注任何人。在 <Link href="/members" style={{ color: "var(--brand)" }}>成员列表</Link> 或用户主页点「+ 关注」。
          </div>
        ) : followedThreads.length === 0 ? (
          <EmptyState title="关注的人还没发新帖" description="他们发帖后会出现在这里。" />
        ) : (
          <ul className="post-list" style={{ margin: 0 }}>
            {followedThreads.map((t) => (
              <li key={t.id} className="post-item">
                <UserAvatar username={t.author.username} avatarUrl={t.author.avatarUrl} size={36} radius={10} />
                <div className="post-body">
                  <div className="post-title-row">
                    <Link href={threadHref(t.id, t.title)} prefetch={false} className="post-title" style={{ flex: 1 }}>
                      {t.title}
                    </Link>
                  </div>
                  <div className="post-meta">
                    <span style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: 12 }}>{t.author.username}</span>
                    <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>· {t.board.name}</span>
                    {t.category?.name && <span className={`topic-badge ${catToneClass(t.category.name)}`}>{t.category.name}</span>}
                    <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>· {formatDate(t.lastPostAt).split(" ")[0]}</span>
                  </div>
                </div>
                <div className="post-right">
                  <span className="post-count replies">{t._count.posts - 1}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
