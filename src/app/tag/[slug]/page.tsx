import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { hotTags } from "@/lib/taxonomy";
import { formatDate, catToneClass } from "@/lib/format";
import { threadHref } from "@/lib/slug";
import UserAvatar from "@/components/UserAvatar";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

async function loadTag(slug: string) {
  return db.tag.findFirst({ where: { slug }, select: { id: true, name: true, slug: true, count: true } }).catch(() => null);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tag = await loadTag(decodeURIComponent(slug));
  if (!tag) return { title: "标签不存在", robots: { index: false, follow: false } };
  const site = (process.env.SITE_URL ?? "https://forum.example.com").replace(/\/$/, "");
  return {
    title: `#${tag.name}`,
    description: `带有「${tag.name}」标签的主题，共 ${tag.count} 篇 — SHUAI GAY 社区。`,
    alternates: { canonical: `${site}/tag/${encodeURIComponent(tag.slug)}` },
  };
}

export default async function TagPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tag = await loadTag(decodeURIComponent(slug));
  if (!tag) notFound();

  const [threads, hot] = await Promise.all([
    db.threadTag
      .findMany({
        where: { tagId: tag.id, thread: { status: "approved", board: { isHidden: false } } },
        orderBy: { thread: { lastPostAt: "desc" } },
        take: 40,
        select: {
          thread: {
            select: {
              id: true,
              title: true,
              lastPostAt: true,
              locked: true,
              digested: true,
              category: { select: { name: true } },
              author: { select: { username: true, avatarUrl: true } },
              board: { select: { slug: true, name: true } },
              _count: { select: { posts: true } },
            },
          },
        },
      })
      .then((rows) => rows.map((r) => r.thread))
      .catch(() => []),
    hotTags(18),
  ]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>#{tag.name}</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-subtle)" }}>
          {tag.count} 篇主题 · 按最新回复排序
        </p>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>相关标签</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {hot.map((t) => (
            <Link
              key={t.slug}
              href={`/tag/${encodeURIComponent(t.slug)}`}
              prefetch={false}
              className="tag-chip"
              style={t.slug === tag.slug ? { borderColor: "var(--brand)", color: "var(--brand)", background: "var(--brand-soft)" } : undefined}
            >
              #{t.name} <span style={{ opacity: 0.6, marginLeft: 4 }}>{t.count}</span>
            </Link>
          ))}
          {hot.length === 0 && <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>还没有其它标签</span>}
        </div>
      </div>

      {threads.length === 0 ? (
        <EmptyState title="这个话题还没有主题" description="发帖时填上标签，就能在这里聚合。" />
      ) : (
        <ul className="post-list card" style={{ padding: "4px 14px" }}>
          {threads.map((t) => (
            <li key={t.id} className="post-item">
              <UserAvatar username={t.author.username} avatarUrl={t.author.avatarUrl} size={38} radius={11} />
              <div className="post-body">
                <div className="post-title-row">
                  {t.digested && <span className="topic-badge digest">精华</span>}
                  {t.locked && <span className="topic-badge locked">已锁</span>}
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
                <span className="post-count replies">{Math.max(0, t._count.posts - 1)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
