import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { threadHref } from "@/lib/slug";
import { updateBioAction } from "@/app/actions/user";
import AvatarUploader from "@/components/AvatarUploader";
import EmptyState from "@/components/EmptyState";
import AuthRequired from "@/components/AuthRequired";

type Tab = "topics" | "replies";

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
  searchParams: Promise<{ tab?: string }>;
}) {
  const { username } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "replies" ? "replies" : "topics";

  const user = await db.user.findUnique({
    where: { username },
    include: { _count: { select: { threads: true, posts: true } } },
  });
  if (!user) notFound();

  const me = await getCurrentUser();
  const isSelf = me?.id === user.id;

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

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{user.username}</span>
      </div>

      {/* 资料卡 */}
      <div className="card" style={{ padding: 18 }}>
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
              {user.role === "ADMIN" && (
                <span style={{ background: "var(--inverse)", color: "var(--inverse-text)", fontSize: 10, padding: "2px 6px", borderRadius: 999 }}>
                  管理员
                </span>
              )}
              {isSelf && (
                <Link
                  href="/invite"
                  style={{ fontSize: 12, color: "var(--brand)", fontWeight: 600 }}
                >
                  我的邀请 →
                </Link>
              )}
              {!isSelf && me && (
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
              <span>
                <span style={{ color: "var(--text-subtle)" }}>主题 </span>
                <strong>{user._count.threads}</strong>
              </span>
              <span>
                <span style={{ color: "var(--text-subtle)" }}>回复 </span>
                <strong>{Math.max(0, user._count.posts - user._count.threads)}</strong>
              </span>
              <span style={{ color: "var(--text-subtle)" }}>注册于 {formatDate(user.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* 本人可更换头像 */}
        {isSelf && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>头像设置</div>
            <AvatarUploader username={user.username} initialUrl={avSrc} />
          </div>
        )}

        {/* 本人可编辑 bio / 未登录提示 */}
        {isSelf ? (
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
        ) : !me ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-soft)" }}>
            <AuthRequired title="登录后可编辑个人简介" description="当前为访客身份，登录后可修改头像、简介等个人信息。" next={`/u/${encodeURIComponent(user.username)}`} />
          </div>
        ) : null}
      </div>

      {/* Tab 切换 */}
      <div className="tab-bar" style={{ margin: 0 }}>
        <Link href={`/u/${encodeURIComponent(user.username)}`} className={`tab ${tab === "topics" ? "active" : ""}`}>
          主题 <span style={{ marginLeft: 4, opacity: 0.75 }}>{user._count.threads}</span>
        </Link>
        <Link
          href={`/u/${encodeURIComponent(user.username)}?tab=replies`}
          className={`tab ${tab === "replies" ? "active" : ""}`}
        >
          回复 <span style={{ marginLeft: 4, opacity: 0.75 }}>{Math.max(0, user._count.posts - user._count.threads)}</span>
        </Link>
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
                    <Link href={threadHref(t.id, t.title)} className="post-title">
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
                      <Link href={threadHref(p.threadId, p.thread.title)} className="post-title" style={{ fontSize: 13 }}>
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
                  <Link href={threadHref(p.threadId, p.thread.title)} className="post-tag" style={{ fontSize: 11 }}>
                    查看
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
