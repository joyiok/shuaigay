import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { listThreads } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";
import { formatDate } from "@/lib/format";
import { threadHref } from "@/lib/slug";
import UserAvatar from "@/components/UserAvatar";
import InfiniteList from "@/components/InfiniteList";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import type { ThreadListItem } from "@/lib/queries";
import type { Cursor } from "@/lib/cursor";

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

/** 版块数据加载:合并在 try/catch 外侧,notFound 不被误吞 */
async function loadBoardPage(boardId: string, cursor: Cursor | null) {
  const { pinned, items, nextCursor } = await listThreads(boardId, cursor);
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
  searchParams: Promise<{ cursor?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { cursor: rawCursor, error } = await searchParams;
  const board = await db.board.findUnique({ where: { slug } });
  if (!board) notFound();

  let loaded: Awaited<ReturnType<typeof loadBoardPage>>;
  try {
    loaded = await loadBoardPage(board.id, decodeCursor(rawCursor));
  } catch {
    // 数据库暂不可用时展示可重试的错误卡片，而不是整页崩溃
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

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      <div className="breadcrumb" itemScope itemType="https://schema.org/BreadcrumbList">
        <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
          <Link itemProp="item" href="/">
            <span itemProp="name">首页</span>
          </Link>
          <meta itemProp="position" content="1" />
        </span>
        <span>/</span>
        <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
          <Link itemProp="item" href={`/c/${board.slug}`} style={{ fontWeight: 600, color: "var(--text)" }}>
            <span itemProp="name">{board.name}</span>
          </Link>
          <meta itemProp="position" content="2" />
        </span>
      </div>

      <div className="card" style={{ padding: 14, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{board.name}</h1>
          {board.description && <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>{board.description}</p>}
        </div>
        <Link
          href={`/c/${board.slug}/new`}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            height: 32,
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

      {error && ERRORS[error] && (
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          {ERRORS[error]}
        </p>
      )}

      <div className="topic-toolbar">
        <div className="tab-bar">
          <Link href={`/c/${board.slug}`} className={`tab ${!rawCursor ? "active" : ""}`}>
            全部
          </Link>
          <Link href={`/c/${board.slug}`} className="tab">
            热门
          </Link>
        </div>
      </div>

      {nextCursor ? (
        <InfiniteList
          variant="thread"
          nextHref={`/c/${board.slug}?cursor=${nextCursor}`}
          fetchUrl={`/api/threads?board=${board.slug}`}
        >
          {pinned.map((t) => (
            <ThreadRow key={t.id} t={t} pinned />
          ))}
          {items.map((t) => (
            <ThreadRow key={t.id} t={t} />
          ))}
        </InfiniteList>
      ) : pinned.length === 0 && items.length === 0 ? (
        <EmptyState variant="thread" actionLabel="发第一帖" actionHref={`/c/${board.slug}/new`} />
      ) : (
        <ul className="post-list">
          {pinned.map((t) => (
            <ThreadRow key={t.id} t={t} pinned />
          ))}
          {items.map((t) => (
            <ThreadRow key={t.id} t={t} />
          ))}
        </ul>
      )}

      {rawCursor && (
        <div style={{ textAlign: "center" }}>
          <Link
            href={`/c/${board.slug}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 32,
              padding: "0 14px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--panel)",
              fontSize: 13,
            }}
          >
            回第一页
          </Link>
        </div>
      )}
    </div>
  );
}

function ThreadRow({ t, pinned }: { t: ThreadListItem; pinned?: boolean }) {
  return (
    <li className="post-item">
      <UserAvatar username={t.authorName} avatarUrl={t.authorAvatarUrl} size={40} radius={10} />
      <div className="post-body">
        <div className="post-title-row" style={{ gap: 8 }}>
          {pinned && <span className="topic-badge pinned">置顶</span>}
          {t.locked && <span className="topic-badge" style={{ background: "var(--line-soft)" }}>已锁</span>}
          <Link href={threadHref(t.id, t.title)} className="post-title" style={{ flex: 1 }}>
            {t.title}
          </Link>
        </div>
        <div className="post-meta" style={{ gap: 10, marginTop: 6 }}>
          <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>{t.authorName}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-subtle)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "var(--bg-soft)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              {t.views ?? 0}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "var(--panel)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              {t.replyCount}
            </span>
          </span>
          <span style={{ color: "var(--text-subtle)" }}>{formatDate(t.lastPostAt)}</span>
        </div>
      </div>
    </li>
  );
}
