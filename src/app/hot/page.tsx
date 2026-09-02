import Link from "next/link";
import type { Metadata } from "next";
import { getCachedCategoryCloud, getCachedHotRanking } from "@/lib/cached";
import { formatDate } from "@/lib/format";
import { threadHref } from "@/lib/slug";
import UserAvatar from "@/components/UserAvatar";

export const metadata: Metadata = {
  title: "热榜 - SHUAI GAY 论坛",
  description: "按浏览与回复热度排序的今日 / 本周热帖榜单 — SHUAI GAY 社区。",
  alternates: { canonical: "/hot" },
};

const RANK_STYLE = (idx: number): { bg: string; color: string } => {
  if (idx === 0) return { bg: "#fef3c7", color: "#d97706" };
  if (idx === 1) return { bg: "#e5e7eb", color: "#4b5563" };
  if (idx === 2) return { bg: "#ffedd5", color: "#c2410c" };
  return { bg: "var(--bg-soft)", color: "var(--text-subtle)" };
};

export default async function HotPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rawRange } = await searchParams;
  const isWeek = rawRange === "week";
  const rangeDays = isWeek ? 7 : 1;
  const rangeLabel = isWeek ? "本周热榜" : "今日热榜";
  const [topics, tagCloud] = await Promise.all([getCachedHotRanking(rangeDays), getCachedCategoryCloud()]);

  const siteOrigin = (process.env.SITE_URL ?? "https://forum.example.com").replace(/\/$/, "");
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${rangeLabel} · SHUAI GAY 论坛`,
    url: `${siteOrigin}/hot${isWeek ? "?range=week" : ""}`,
    numberOfItems: topics.length,
    itemListElement: topics.slice(0, 20).map((t: any, idx: number) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${siteOrigin}${threadHref(t.id, t.title)}`,
      name: t.title,
    })),
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <Link href="/hot" style={{ fontWeight: 600, color: "var(--text)" }}>热榜</Link>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🔥</span>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{rangeLabel}</h1>
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>(浏览 + 回复)</span>
          </div>
          <div className="tab-bar" style={{ margin: 0 }}>
            <Link href="/hot" className={`tab ${!isWeek ? "active" : ""}`}>今日</Link>
            <Link href="/hot?range=week" className={`tab ${isWeek ? "active" : ""}`}>本周</Link>
          </div>
        </div>
      </div>

      {topics.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>还没有热帖</div>
          <div style={{ fontSize: 12 }}>{rangeLabel}暂无数据，去发一帖抢占榜首吧</div>
          <Link href="/c/general/new" style={{ marginTop: 8, display: "inline-flex", height: 30, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 999, background: "var(--panel)", fontSize: 12 }}>去发帖 →</Link>
        </div>
      ) : (
        <ul className="post-list">
          {topics.map((t: any, idx: number) => {
            const rank = RANK_STYLE(idx);
            return (
              <li key={t.id} className="post-item" style={{ gap: 12 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 8,
                    background: rank.bg,
                    color: rank.color,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>
                <UserAvatar username={t.author.username} avatarUrl={t.author.avatarUrl} size={36} radius={10} />
                <div className="post-body">
                  <div className="post-title-row" style={{ gap: 8, alignItems: "center" }}>
                    {(t as any).status === "pending" && <span className="topic-badge" style={{ background: "#FFF7A8", border: "1.5px solid var(--line)", color: "var(--text)", fontWeight: 700, flexShrink: 0 }}>待审</span>}
                    <Link href={threadHref(t.id, t.title)} className="post-title" style={{ flex: 1, minWidth: 0 }} title={t.title}>
                      {t.title}
                    </Link>
                    <span className="topic-badge" style={{ background: "var(--bg-soft)", flexShrink: 0 }}>
                      {t.board.name}
                    </span>
                  </div>
                  <div className="post-meta" style={{ gap: 8, marginTop: 3 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-muted)", fontSize: 12 }}>{t.author.username}</span>
                    <span style={{ color: "var(--text-subtle)", fontSize: 11 }}>· {formatDate(t.lastPostAt).split(" ")[0]}</span>
                    <span style={{ background: "#fef3c7", color: "#d97706", border: "1px solid #fde68a", padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                      热度 {t.heat}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-subtle)", fontSize: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--bg-soft)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontSize: 11 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" /></svg>
                      {t.views}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--panel)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontSize: 11 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                      {t.replyCount}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tagCloud.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="quick-title" style={{ margin: "0 0 10px", fontFamily: "Space Grotesk, sans-serif" }}>话题标签云 <span>{tagCloud.length} 分类 · 按主题数排序</span></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tagCloud.map((c: any) => {
              const size = c._count.threads > 10 ? 13 : c._count.threads > 3 ? 12 : 11;
              const weight = c._count.threads > 10 ? 700 : 500;
              return (
                <Link key={c.id} href={`/c/${c.board.slug}?cat=${c.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 999, padding: `4px 10px`, fontSize: size, fontWeight: weight, boxShadow: "1px 1px 0 var(--line)", textDecoration: "none", color: "var(--text)" }}>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--text-subtle)" }}>{c.board.name}</span>
                  <span>{c.name}</span>
                  <span style={{ background: "var(--bg-soft)", border: "1px solid var(--line-soft)", borderRadius: 999, padding: "1px 6px", fontSize: 10, color: "var(--text-subtle)" }}>{c._count.threads}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {topics.length > 0 && (
        <p style={{ color: "var(--text-subtle)", fontSize: 12, textAlign: "center" }}>
          热度 = 浏览 + 回复，每 60 秒更新 · <Link href="/" style={{ color: "var(--brand)" }}>回首页</Link>
        </p>
      )}
    </div>
  );
}