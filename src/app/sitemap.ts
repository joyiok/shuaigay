import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site";

// 构建阶段(Docker build)没有数据库,必须请求时才查库
// 内容变化不频繁,CDN / 浏览器各自有缓存兜底
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl().origin;

  const [boards, threads] = await Promise.all([
    db.board.findMany({
      orderBy: { order: "asc" },
      select: { slug: true, createdAt: true },
    }),
    db.thread
      .findMany({
        orderBy: { lastPostAt: "desc" },
        take: 100, // 最新 100 条足够覆盖活跃内容
        select: { id: true, lastPostAt: true },
      })
      .catch(() => []),
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
      url: `${base}/t/${t.id}`,
      lastModified: t.lastPostAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}