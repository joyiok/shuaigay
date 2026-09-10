import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { listThreads } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";
import { catToneClass, formatDate } from "@/lib/format";
import { threadHref } from "@/lib/slug";
import UserAvatar from "@/components/UserAvatar";
import InfiniteList from "@/components/InfiniteList";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import type { ThreadListItem } from "@/lib/queries";
import type { Cursor } from "@/lib/cursor";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { isBoardModerator, listBoardModerators } from "@/lib/moderators";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const board = await db.board.findUnique({ where: { slug } }).catch(() => null);
  // 版块被删：正文会走 notFound()；这里给描述性标题并禁止收录
  // （根 layout 有 loading 边界，流式渲染下状态码可能是 200）
  if (!board) return { title: "版块不存在", robots: { index: false, follow: false } };
  const site = process.env.SITE_URL ?? "https://forum.example.com";
  const url = `${site}/c/${board.slug}`;
  const title = board.name;
  const socialTitle = `${board.name} - SHUAI GAY 社区`;
  const description = board.description || `${board.name} — SHUAI GAY 社区的讨论版块。`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: socialTitle, description, url, type: "website", siteName: "SHUAI GAY 社区", locale: "zh_CN" },
    twitter: { card: "summary", title: socialTitle, description },
  };
}

async function loadBoardPage(boardId: string, cursor: Cursor | null, categoryId: string | null, viewerId: string | null = null, isStaff = false) {
  const { pinned, items, nextCursor } = await listThreads(boardId, cursor, categoryId, viewerId, isStaff);
  return { pinned, items, nextCursor };
}

const ERRORS: Record<string, string> = {
  ratelimited: "操作太频繁,请稍后再试",
  invalid: "标题或内容格式不对",
};

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string; error?: string; cat?: string; pending?: string }>;
}) {
  const { slug } = await params;
  const { cursor: rawCursor, error, cat: rawCat, pending } = await searchParams;
  const board = await db.board.findUnique({ where: { slug } });
  if (!board) notFound();
  const viewer = await getCurrentUser();
  const viewerIsStaff = isAdmin(viewer) || (viewer ? await isBoardModerator(viewer.id, board.id) : false);
  if ((board as unknown as { isHidden: boolean }).isHidden && !viewerIsStaff) notFound();

  const [categories, moderators] = await Promise.all([
    db.threadCategory.findMany({ where: { boardId: board.id }, orderBy: { order: "asc" } }),
    listBoardModerators(board.id),
  ]);
  const categoryId = rawCat && categories.some((c) => c.id === rawCat) ? rawCat : null;

  let loaded: Awaited<ReturnType<typeof loadBoardPage>>;
  try {
    loaded = await loadBoardPage(board.id, decodeCursor(rawCursor), categoryId, viewer?.id ?? null, viewerIsStaff);
  } catch {
    return <ErrorState title="加载版块失败" description="数据库暂时不可用，请稍后重试或返回首页。" code={500} />;
  }
  const { pinned, items, nextCursor } = loaded;
  const isNovel = board.slug === "novel";

  const siteOrigin = (process.env.SITE_URL ?? "https://forum.example.com").replace(/\/$/, "");
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: siteOrigin },
      { "@type": "ListItem", position: 2, name: board.name, item: `${siteOrigin}/c/${board.slug}` },
    ],
  };
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: board.name,
    description: board.description ?? `${board.name} 版块`,
    url: `${siteOrigin}/c/${board.slug}`,
    isPartOf: { "@type": "WebSite", name: "SHUAI GAY 论坛", url: siteOrigin },
  };

  const catParam = (id: string | null) => (id ? `&cat=${id}` : "");
  const nextHref = nextCursor ? `/c/${board.slug}?cursor=${encodeURIComponent(nextCursor)}${categoryId ? `&cat=${categoryId}` : ""}` : null;
  const fetchUrl = `/api/threads?board=${board.slug}${categoryId ? `&cat=${categoryId}` : ""}`;

  return (
    <div className={isNovel ? "novel-library" : undefined} style={{ display: "grid", gap: 12 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      <div className="breadcrumb" itemScope itemType="https://schema.org/BreadcrumbList">
        <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
          <Link itemProp="item" href="/"><span itemProp="name">首页</span></Link><meta itemProp="position" content="1" />
        </span>
        <span>/</span>
        <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
          <Link itemProp="item" href={`/c/${board.slug}`} style={{ fontWeight: 600, color: "var(--text)" }}><span itemProp="name">{board.name}</span></Link><meta itemProp="position" content="2" />
        </span>
      </div>

      <div className={`card${isNovel ? " novel-library-head" : ""}`} style={{ padding: 14, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: isNovel ? 28 : 18, fontWeight: 800, margin: 0 }}>{isNovel ? "小说书架" : board.name}</h1>
            {(board as unknown as { isHidden: boolean }).isHidden && <span style={{ background: "var(--text)", color: "var(--panel)", fontSize: 10, padding: "2px 6px", borderRadius: 999, fontWeight: 700 }}>隐藏</span>}
            {(board as unknown as { isLocked: boolean }).isLocked && <span className="topic-badge locked">锁定</span>}
          </div>
          {board.description && <p style={{ color: "var(--text-muted)", fontSize: isNovel ? 14 : 12, marginTop: isNovel ? 8 : 4 }}>{board.description}</p>}
          {isNovel && <p className="novel-library-note">一部作品一个主题，作者在主题中回复即可续写下一章。</p>}
          {moderators.length > 0 && (
            <p style={{ color: "var(--text-subtle)", fontSize: 12, marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>版主:</span>
              {moderators.map((m) => (
                <Link key={m.id} href={`/u/${encodeURIComponent(m.user.username)}`} style={{ color: "var(--brand)", fontWeight: 600 }}>{m.user.username}</Link>
              ))}
            </p>
          )}
        </div>
        {(board as unknown as { isLocked: boolean }).isLocked && !viewerIsStaff ? (
          <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", height: 32, padding: "0 14px", background: "var(--bg-soft)", color: "var(--text-subtle)", border: "1.5px solid var(--line-soft)", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>已锁定</span>
        ) : (
          <Link href={`/c/${board.slug}/new`} className="btn-publish" style={{ flexShrink: 0, minHeight: 36, padding: "0 14px" }}>{isNovel ? "发布作品" : "发新帖"}</Link>
        )}
      </div>

      {error && ERRORS[error] && (
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>{ERRORS[error]}</p>
      )}
      {pending && (
        <p className="notice-pending">内容已提交，待版主/管理员审核后可见</p>
      )}

      <div className={`board-toolbar${isNovel ? " novel-genres" : ""}`}>
        <div className="tab-bar" style={{ minWidth: 0 }}>
          <span className="toolbar-label">{categories.length > 0 ? "分类" : isNovel ? "全部作品" : "全部主题"}</span>
          {categories.length > 0 && (
            <>
              <Link href={`/c/${board.slug}`} className={`tab ${!categoryId ? "active" : ""}`}>全部</Link>
              {categories.map((c) => (
                <Link key={c.id} href={`/c/${board.slug}?cat=${c.id}`} className={`tab ${categoryId === c.id ? "active" : ""}`}>
                  {c.name}
                </Link>
              ))}
            </>
          )}
        </div>
      </div>

      {nextHref ? (
        <InfiniteList variant="thread" nextHref={nextHref} fetchUrl={fetchUrl} novel={isNovel}>
          {pinned.map((t) => (<ThreadRow key={t.id} t={t} pinned novel={isNovel} />))}
          {items.map((t) => (<ThreadRow key={t.id} t={t} novel={isNovel} />))}
        </InfiniteList>
      ) : pinned.length === 0 && items.length === 0 ? (
        <EmptyState
          variant="thread"
          title={isNovel ? "书架还空着" : undefined}
          description={isNovel ? "来写下这里的第一段故事。" : undefined}
          actionLabel={isNovel ? "发布第一部作品" : "发第一帖"}
          actionHref={`/c/${board.slug}/new`}
        />
      ) : (
        <ul className="post-list">
          {pinned.map((t) => (<ThreadRow key={t.id} t={t} pinned novel={isNovel} />))}
          {items.map((t) => (<ThreadRow key={t.id} t={t} novel={isNovel} />))}
        </ul>
      )}

      {rawCursor && (
        <div style={{ textAlign: "center" }}>
          <Link href={`/c/${board.slug}${categoryId ? `?cat=${categoryId}` : ""}`} style={{ display: "inline-flex", alignItems: "center", height: 32, padding: "0 14px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--panel)", fontSize: 13 }}>回第一页</Link>
        </div>
      )}
    </div>
  );
}

function ThreadRow({ t, pinned, novel = false }: { t: ThreadListItem; pinned?: boolean; novel?: boolean }) {
  const isPending = (t as any).status === "pending";
  const isHot = t.replyCount > 8;
  return (
    <li className={`post-item${novel ? " novel-book" : ""}`} style={{ opacity: isPending ? 0.72 : 1 }}>
      {novel ? (
        <div className="novel-cover" aria-hidden><span>{t.title.trim().slice(0, 1) || "书"}</span></div>
      ) : (
        <UserAvatar username={t.authorName} avatarUrl={t.authorAvatarUrl} size={38} radius={11} />
      )}
      <div className="post-body">
        <div className="post-title-row" style={{ gap: 8 }}>
          {pinned && <span className="topic-badge pinned">{t.globalPinned ? "全局置顶" : "置顶"}</span>}
          {t.digested && <span className="topic-badge digest">精华</span>}
          {isPending && <span className="topic-badge pending">待审</span>}
          {t.locked && <span className="topic-badge locked">已锁</span>}
          <Link href={threadHref(t.id, t.title)} prefetch={false} className="post-title" style={{ flex: 1 }}>{t.title}</Link>
        </div>
        <div className="post-meta">
          {t.categoryName && <span className={`topic-badge ${catToneClass(t.categoryName)}`}>{t.categoryName}</span>}
          <span style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: 12 }}>{novel ? `作者 · ${t.authorName}` : t.authorName}</span>
          <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{formatDate(t.lastPostAt).split(" ")[0]}</span>
          {isHot && !novel && <span className="topic-badge hot">热门</span>}
        </div>
      </div>
      <div className="post-right">
        <span className="post-count views" aria-label={`${t.views ?? 0} 次浏览`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
          </svg>
          {t.views ?? 0}
        </span>
        <span className="post-count replies" aria-label={novel ? "更新状态" : `${t.replyCount} 条回复`}>
          {novel ? (
            <span style={{ fontWeight: 700, color: t.replyCount > 0 ? "var(--brand)" : "var(--text-subtle)", fontSize: 11.5 }}>{t.replyCount > 0 ? "连载中" : "新作"}</span>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
              {t.replyCount}
            </>
          )}
        </span>
      </div>
    </li>
  );
}
