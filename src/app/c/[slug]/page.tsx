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
  if (!board) return { title: "版块不存在" };
  const site = process.env.SITE_URL ?? "https://forum.example.com";
  const url = `${site}/c/${board.slug}`;
  const title = `${board.name} - SHUAI GAY 社区`;
  const description = board.description || `${board.name} — SHUAI GAY 社区的讨论版块。`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "SHUAI GAY 社区", locale: "zh_CN" },
    twitter: { card: "summary", title, description },
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
    <div style={{ display: "grid", gap: 12 }}>
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

      <div className="card" style={{ padding: 14, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{board.name}</h1>
            {(board as unknown as { isHidden: boolean }).isHidden && <span style={{ background: "var(--text)", color: "var(--panel)", fontSize: 10, padding: "2px 6px", borderRadius: 999, fontWeight: 700 }}>隐藏</span>}
            {(board as unknown as { isLocked: boolean }).isLocked && <span style={{ background: "#FFF7A8", color: "var(--text)", border: "1.5px solid var(--line)", fontSize: 10, padding: "2px 6px", borderRadius: 999, fontWeight: 700 }}>锁定</span>}
          </div>
          {board.description && <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>{board.description}</p>}
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
          <Link href={`/c/${board.slug}/new`} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", height: 32, padding: "0 14px", background: "var(--text)", color: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 8, fontSize: 13, fontWeight: 700, boxShadow: "2px 2px 0 var(--line)" }}>发新帖</Link>
        )}
      </div>

      {error && ERRORS[error] && (
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>{ERRORS[error]}</p>
      )}
      {pending && (
        <p style={{ background: "#FFF7A8", color: "var(--text)", border: "1.5px solid var(--line)", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600 }}>内容已提交，待版主/管理员审核后可见</p>
      )}

      <div className="topic-toolbar">
        <div className="tab-bar">
          <Link href={`/c/${board.slug}`} className={`tab ${!rawCursor ? "active" : ""}`}>全部</Link>
          <Link href={`/c/${board.slug}`} className="tab">热门</Link>
        </div>
      </div>

      {categories.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Link href={`/c/${board.slug}`} className={`tab ${!categoryId ? "active" : ""}`} style={{ height: 28, fontSize: 12 }}>全部</Link>
          {categories.map((c) => (
            <Link key={c.id} href={`/c/${board.slug}?cat=${c.id}`} className={`tab ${categoryId === c.id ? "active" : ""}`} style={{ height: 28, fontSize: 12 }}>
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {nextHref ? (
        <InfiniteList variant="thread" nextHref={nextHref} fetchUrl={fetchUrl}>
          {pinned.map((t) => (<ThreadRow key={t.id} t={t} pinned />))}
          {items.map((t) => (<ThreadRow key={t.id} t={t} />))}
        </InfiniteList>
      ) : pinned.length === 0 && items.length === 0 ? (
        <EmptyState variant="thread" actionLabel="发第一帖" actionHref={`/c/${board.slug}/new`} />
      ) : (
        <ul className="post-list">
          {pinned.map((t) => (<ThreadRow key={t.id} t={t} pinned />))}
          {items.map((t) => (<ThreadRow key={t.id} t={t} />))}
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

function ThreadRow({ t, pinned }: { t: ThreadListItem; pinned?: boolean }) {
  const isPending = (t as any).status === "pending";
  return (
    <li className="post-item" style={{ opacity: isPending ? 0.7 : 1 }}>
      <UserAvatar username={t.authorName} avatarUrl={t.authorAvatarUrl} size={40} radius={10} />
      <div className="post-body">
        <div className="post-title-row" style={{ gap: 8 }}>
          {pinned && <span className="topic-badge pinned">置顶</span>}
          {isPending && <span className="topic-badge" style={{ background: "#FFF7A8", border: "1.5px solid var(--line)", color: "var(--text)", fontWeight: 700 }}>待审</span>}
          {t.locked && <span className="topic-badge" style={{ background: "var(--line-soft)" }}>已锁</span>}
          {t.categoryName && <span className={`topic-badge ${catToneClass(t.categoryName)}`}>{t.categoryName}</span>}
          <Link href={threadHref(t.id, t.title)} className="post-title" style={{ flex: 1 }}>{t.title}</Link>
        </div>
        <div className="post-meta" style={{ gap: 10, marginTop: 6 }}>
          <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>{t.authorName}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-subtle)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "var(--bg-soft)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" /></svg>
              {t.views ?? 0}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "var(--panel)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
              {t.replyCount}
            </span>
          </span>
          <span style={{ color: "var(--text-subtle)" }}>{formatDate(t.lastPostAt)}</span>
        </div>
      </div>
    </li>
  );
}
