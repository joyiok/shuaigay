import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { listPosts } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";
import { renderMarkdown, linkMentions, collectMentionCandidates } from "@/lib/markdown";
import Lightbox from "@/components/Lightbox";
import Composer from "@/components/Composer";
import ErrorState from "@/components/ErrorState";
import { canDeletePost, canEditPost, canReply, isAdmin } from "@/lib/permissions";
import type { Cursor } from "@/lib/cursor";
import {
  deletePostAction,
  replyAction,
  toggleLockAction,
  togglePinAction,
} from "@/app/actions/threads";
import ReportButton from "@/components/report-button";
import PostEditor from "@/components/PostEditor";
import EditHistory from "@/components/EditHistory";
import Turnstile from "@/components/Turnstile";
import UserAvatar from "@/components/UserAvatar";
import { formatDate, formatBytes } from "@/lib/format";
import { makeExcerpt } from "@/lib/excerpt";
import { MAX_FILES_PER_POST, maxUploadBytes } from "@/lib/storage";
import { parseThreadId, slugify, threadHref } from "@/lib/slug";

const ERRORS: Record<string, string> = {
  invalid: "内容格式不对",
  forbidden: "没有权限做这个操作",
  locked: "主题已锁定",
  ratelimited: "操作太频繁,请稍后再试",
  file_too_large: "有附件超过大小限制",
  unsupported_type: "不支持的附件类型",
  too_many_files: `最多 ${MAX_FILES_PER_POST} 个附件`,
  captcha_failed: "人机验证未通过，请重新验证后重试",
  sensitive: "内容包含敏感词，请修改后重试",
};

/** SEO: 利于收录的标题与描述 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: raw } = await params;
  const id = parseThreadId(raw);
  const thread = await db.thread
    .findUnique({
      where: { id },
      include: {
        board: { select: { name: true, slug: true } },
        author: { select: { username: true } },
        posts: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { contentMd: true },
        },
        _count: { select: { posts: true } },
      },
    })
    .catch(() => null);
  if (!thread) return { title: "主题不存在 | SHUAI GAY" };

  const rawExcerpt = makeExcerpt(thread.posts[0]?.contentMd ?? "", "", 120);
  const description = rawExcerpt || `${thread.title} — 来自 ${thread.board.name} 版块，SHUAI GAY 社区的讨论。`;
  const title = `${thread.title} - ${thread.board.name} - SHUAI GAY 社区`;
  const siteUrl = process.env.SITE_URL ?? "https://forum.example.com";
  const url = `${siteUrl}${threadHref(id, thread.title)}`;
  const keywords = [thread.title, thread.board.name, thread.author.username, "SHUAI GAY", "论坛", "社区"];
  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "article",
      url,
      siteName: "SHUAI GAY 社区",
      locale: "zh_CN",
      authors: [thread.author.username],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/** 主题页数据加载:合并在 try/catch 外侧,notFound 不被误吞 */
async function loadThreadPage(rawId: string, cursor: Cursor | null) {
  const id = parseThreadId(rawId);
  const thread = await db.thread.findUnique({
    where: { id },
    include: { board: { select: { slug: true, name: true } } },
  });
  if (!thread) return null;
  const user = await getCurrentUser();
  const { items, nextCursor } = await listPosts(thread.id, cursor);
  return { thread, user, items, nextCursor };
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string; error?: string }>;
}) {
  const { id } = await params;
  const { cursor: rawCursor, error } = await searchParams;

  let loaded: Awaited<ReturnType<typeof loadThreadPage>>;
  try {
    loaded = await loadThreadPage(id, decodeCursor(rawCursor));
  } catch {
    // 数据库暂不可用时展示可重试的错误卡片，而不是整页崩溃
    return <ErrorState title="加载主题失败" description="数据库暂时不可用，请稍后重试或返回首页。" code={500} />;
  }
  if (!loaded) notFound();

  const { thread, user, items, nextCursor } = loaded;
  // 访问量 +1（fire-and-forget，不阻塞渲染，失败静默）
  const currentViews = (thread as unknown as { views: number }).views ?? 0;
  void db.thread.update({ where: { id: thread.id }, data: { views: { increment: 1 } } }).catch(() => {});
  (thread as unknown as { views: number }).views = currentViews + 1;
  const admin = isAdmin(user);

  // @提及:一次性查出本页所有候选用户名,只有真实存在的用户才渲染成链接
  const mentionCandidates = collectMentionCandidates(items.map((p) => p.contentMd));
  const mentionUsers = mentionCandidates.length
    ? await db.user.findMany({
        where: { username: { in: mentionCandidates } },
        select: { username: true },
      })
    : [];
  const existingMentions = new Set(mentionUsers.map((u) => u.username));

  /** 引用按钮用到的楼层摘要:去空白、截断 */
  const excerpt = (md: string) => md.replace(/\s+/g, " ").trim().slice(0, 200);

  const siteUrl = process.env.SITE_URL ?? "https://forum.example.com";
  const canonical = `${siteUrl}${threadHref(thread.id, thread.title)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: thread.title,
    description: makeExcerpt(items[0]?.contentMd ?? "", "", 120) || thread.title,
    url: canonical,
    datePublished: thread.createdAt.toISOString(),
    dateModified: thread.lastPostAt?.toISOString() ?? thread.createdAt.toISOString(),
    author: { "@type": "Person", name: thread.authorId },
    isPartOf: { "@type": "DiscussionForumPosting", name: thread.board.name },
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/ViewAction", userInteractionCount: (thread as unknown as { views: number }).views ?? 0 },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: items.length },
    ],
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <link rel="canonical" href={canonical} />
      <div className="breadcrumb" itemScope itemType="https://schema.org/BreadcrumbList">
        <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
          <Link itemProp="item" href="/">
            <span itemProp="name">首页</span>
          </Link>
          <meta itemProp="position" content="1" />
        </span>
        <span>/</span>
        <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
          <Link itemProp="item" href={`/c/${thread.board.slug}`}>
            <span itemProp="name">{thread.board.name}</span>
          </Link>
          <meta itemProp="position" content="2" />
        </span>
        <span>/</span>
        <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
          <span itemProp="name" style={{ color: "var(--text)", fontWeight: 600 }}>{thread.title}</span>
          <meta itemProp="position" content="3" />
        </span>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, lineHeight: 1.4 }}>{thread.title}</h1>
          {thread.pinned && <span className="topic-badge pinned">置顶</span>}
          {thread.locked && <span className="topic-badge" style={{ background: "var(--line-soft)" }}>已锁</span>}
        </div>
        <div style={{ color: "var(--text-subtle)", fontSize: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Link href={`/c/${thread.board.slug}`} style={{ color: "var(--brand)" }}>
            {thread.board.name}
          </Link>
          <span>· 主题 {thread.id.slice(-6)}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {(thread as unknown as { views: number }).views} 浏览
          </span>
          <span>· {items.length} 楼</span>
        </div>
        {admin && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <form action={togglePinAction}>
              <input type="hidden" name="threadId" value={thread.id} />
              <button
                style={{
                  height: 28,
                  padding: "0 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  background: "var(--panel)",
                  fontSize: 12,
                }}
              >
                {thread.pinned ? "取消置顶" : "置顶"}
              </button>
            </form>
            <form action={toggleLockAction}>
              <input type="hidden" name="threadId" value={thread.id} />
              <button
                style={{
                  height: 28,
                  padding: "0 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  background: "var(--panel)",
                  fontSize: 12,
                }}
              >
                {thread.locked ? "解锁" : "锁定"}
              </button>
            </form>
          </div>
        )}
      </div>

      {error && ERRORS[error] && (
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          {ERRORS[error]}
        </p>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((p, idx) => {
            const isFirstPost = idx === 0 && !rawCursor;
            const deletable = canDeletePost(user, p, {
              isFirstPost,
              threadLocked: thread.locked,
            });
            const editable = canEditPost(user, p, {
              threadLocked: thread.locked,
            });
            return (
              <li
                key={p.id}
                id={`post-${p.id}`}
                style={{
                  padding: 14,
                  borderBottom: idx === items.length - 1 ? "none" : "1px solid var(--bg)",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <UserAvatar username={p.authorName} avatarUrl={p.authorAvatarUrl} size={40} radius={10} />
                  <span style={{ fontWeight: 700 }}>{p.authorName}</span>
                  {p.authorRole === "ADMIN" && (
                    <span style={{ background: "var(--inverse)", color: "var(--inverse-text)", fontSize: 10, padding: "2px 6px", borderRadius: 999 }}>管理员</span>
                  )}
                  <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{formatDate(p.createdAt)}</span>
                  <span style={{ color: "var(--text-subtle)", fontSize: 11, marginLeft: 4 }}>#{idx + 1}</span>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="post-quote-btn"
                      data-author={p.authorName}
                      data-floor={idx + 1}
                      data-text={excerpt(p.contentMd)}
                    >
                      引用
                    </button>
                    {editable && <PostEditor postId={p.id} contentMd={p.contentMd} />}
                    {(!user || user.id !== p.authorId) && <ReportButton postId={p.id} />}
                    {deletable && (
                      <form action={deletePostAction}>
                        <input type="hidden" name="postId" value={p.id} />
                        <button style={{ color: "var(--text-subtle)", fontSize: 12 }} className="hover:text-red-600">
                          删除
                        </button>
                      </form>
                    )}
                  </div>
                </div>
                <div className="post-content" dangerouslySetInnerHTML={{ __html: linkMentions(renderMarkdown(p.contentMd), existingMentions) }} />
                {p.edits.length > 0 && (
                  <EditHistory
                    edits={p.edits.map((e) => ({
                      id: e.id,
                      editorName: e.editorName,
                      oldContentMd: e.oldContentMd,
                      newContentMd: e.newContentMd,
                      createdAt: e.createdAt.toISOString(),
                    }))}
                  />
                )}
                {p.attachments.length > 0 && (
                  <ul style={{ display: "flex", flexWrap: "wrap", gap: 8, borderTop: "1px solid var(--line-soft)", paddingTop: 8, fontSize: 12 }}>
                    {p.attachments.map((a) => (
                      <li key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg)", padding: "4px 8px", borderRadius: 6 }}>
                        <a href={`/uploads/${a.storedName}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-hover)" }}>
                          📎 {a.fileName}
                        </a>
                        <span style={{ color: "var(--text-subtle)" }}>({formatBytes(a.sizeBytes)})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {nextCursor && (
        <div style={{ textAlign: "center" }}>
          <Link
            href={`${threadHref(thread.id, thread.title)}?cursor=${nextCursor}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 32,
              padding: "0 16px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--panel)",
              fontSize: 13,
            }}
          >
            加载后面的回复 →
          </Link>
        </div>
      )}

      <div className="card" style={{ padding: 14 }}>
        {canReply(user, thread) ? (
          <form action={replyAction} style={{ display: "grid", gap: 10 }}>
            <input type="hidden" name="threadId" value={thread.id} />
            <Composer
              placeholder="回复，支持 Markdown（@提及 / 粘贴图片 / 表情）"
              rows={5}
              maxFiles={MAX_FILES_PER_POST}
              maxBytes={maxUploadBytes()}
            />
            <Turnstile resetSignal={error} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                type="submit"
                style={{ background: "var(--brand)", color: "#fff", borderRadius: 6, height: 32, padding: "0 16px", fontSize: 13, fontWeight: 600, border: "1px solid var(--brand)" }}
              >
                回复
              </button>
            </div>
          </form>
        ) : user ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>主题已锁定，无法回复。</p>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            <Link href={`/login?next=${encodeURIComponent(threadHref(thread.id, thread.title))}`} style={{ color: "var(--brand)" }}>
              登录
            </Link>{" "}
            后回复
          </p>
        )}
      </div>

      <Lightbox />
    </div>
  );
}
