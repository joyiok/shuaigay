import Link from "next/link";
import { db } from "@/lib/db";

export default async function HomePage() {
  const [boards, userCount, threadCount, postCount, latestThreads] = await Promise.all([
    db.board.findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { threads: true } } },
    }),
    db.user.count(),
    db.thread.count(),
    db.post.count(),
    db.thread
      .findMany({
        orderBy: { lastPostAt: "desc" },
        take: 8,
        include: { author: { select: { username: true } }, board: { select: { slug: true, name: true } }, _count: { select: { posts: true } } },
      })
      .catch(() => []),
  ]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* 顶部筛选 */}
      <div className="topic-toolbar">
        <div className="tab-bar">
          <Link href="/" className="tab active">
            全部
          </Link>
          <Link href="/?sort=recent" className="tab">
            最新
          </Link>
          <Link href="/?sort=hot" className="tab">
            热门
          </Link>
        </div>
        <Link
          href={boards[0] ? `/c/${boards[0].slug}/new` : "/"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 30,
            padding: "0 14px",
            background: "var(--brand)",
            color: "#fff",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          发新帖
        </Link>
      </div>

      {/* 版块 */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>版块</h2>
          <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{boards.length} 个版块</span>
        </div>
        <ul className="post-list" style={{ border: "none", borderRadius: 0 }}>
          {boards.map((b) => (
            <li key={b.id} className="post-item">
              <div className="post-avatar" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                {b.name.slice(0, 1)}
              </div>
              <div className="post-body">
                <div className="post-title-row">
                  <Link href={`/c/${b.slug}`} className="post-title">
                    {b.name}
                  </Link>
                  {b.description && (
                    <span style={{ color: "var(--text-subtle)", fontSize: 12, marginLeft: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {b.description}
                    </span>
                  )}
                </div>
                <div className="post-meta">
                  <span>
                    <svg className="meta-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 5h16v14H4z" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    {b._count.threads} 主题
                  </span>
                  <span style={{ color: "var(--text-subtle)" }}>{b.slug}</span>
                </div>
              </div>
              <Link href={`/c/${b.slug}`} className="post-tag">
                进入
              </Link>
            </li>
          ))}
          {boards.length === 0 && (
            <li className="post-item" style={{ justifyContent: "center", color: "var(--text-subtle)" }}>
              暂无版块
            </li>
          )}
        </ul>
      </div>

      {/* 最新主题预览 */}
      {latestThreads.length > 0 && (
        <div className="card">
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="quick-title" style={{ margin: 0 }}>
              最新主题 <span>近 8 条</span>
            </div>
          </div>
          <ul className="post-list" style={{ border: "none", borderRadius: 0 }}>
            {latestThreads.map((t: any) => (
              <li key={t.id} className="post-item" style={{ minHeight: 52, padding: "10px 14px" }}>
                <div className="post-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                  {t.author.username.slice(0, 1).toUpperCase()}
                </div>
                <div className="post-body">
                  <div className="post-title-row">
                    <Link href={`/t/${t.id}`} className="post-title" style={{ fontSize: 13 }}>
                      {t.title}
                    </Link>
                    <span className="topic-pages">
                      <span style={{ color: "var(--text-subtle)", fontSize: 11 }}>{t._count.posts - 1} 回复</span>
                    </span>
                  </div>
                  <div className="post-meta" style={{ fontSize: 11, marginTop: 2 }}>
                    <span>{t.author.username}</span>
                    <span style={{ color: "var(--text-subtle)" }}>· {t.board.name}</span>
                  </div>
                </div>
                <Link href={`/c/${t.board.slug}`} className="post-tag" style={{ fontSize: 11 }}>
                  {t.board.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ textAlign: "center", color: "var(--text-subtle)", fontSize: 12, padding: "4px 0" }}>
        注册用户 {userCount} · 主题 {threadCount} · 帖子 {postCount}
      </div>
    </div>
  );
}
