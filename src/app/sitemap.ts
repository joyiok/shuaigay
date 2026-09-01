import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site";
import { slugify } from "@/lib/slug";

// 构建阶段(Docker build)没有数据库,必须请求时才查库
// 内容变化不频繁,CDN / 浏览器各自有缓存兜底
export const dynamic = "force-dynamic";
export const revalidate = 3600;

function threadHrefWithSlug(id: string, title: string): string {
  const slug = slugify(title);
  return `/t/${id}-${slug}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl().origin;

  const [boards, threads, users] = await Promise.all([
    db.board
      .findMany({
        orderBy: { order: "asc" },
        select: { slug: true, createdAt: true },
      })
      .catch(() => [] as { slug: string; createdAt: Date }[]),
    db.thread
      .findMany({
        orderBy: { lastPostAt: "desc" },
        take: 200,
        select: { id: true, title: true, lastPostAt: true },
      })
      .catch(() => [] as { id: string; title: string; lastPostAt: Date }[]),
    db.user
      .findMany({
        orderBy: { threads: { _count: "desc" } },
        take: 50,
        select: { username: true, createdAt: true },
      })
      .catch(() => [] as { username: string; createdAt: Date }[]),
  ]);

  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/search`, changeFrequency: "weekly", priority: 0.3 },
    ...boards.map((b) => ({
      url: `${base}/c/${b.slug}`,
      lastModified: b.createdAt,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    })),
    ...threads.map((t) => ({
      url: `${base}${threadHrefWithSlug(t.id, t.title)}`,
      lastModified: t.lastPostAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...users.map((u) => ({
      url: `${base}/u/${encodeURIComponent(u.username)}`,
      lastModified: u.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
