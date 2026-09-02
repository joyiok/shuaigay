import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";
export const revalidate = 600;

function excerpt(md: string, max = 200): string {
  return md.replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function GET() {
  const base = siteUrl().origin;
  const threads = await db.thread
    .findMany({
      where: { board: { isHidden: false } },
      orderBy: { lastPostAt: "desc" },
      take: 30,
      include: {
        board: { select: { name: true, slug: true } },
        author: { select: { username: true } },
        posts: { orderBy: { createdAt: "asc" }, take: 1, select: { contentMd: true, createdAt: true } },
      },
    })
    .catch(() => [] as any[]);

  const items = threads.map((t: any) => {
    const slug = slugify(t.title);
    const url = `${base}/t/${t.id}-${slug}`;
    const desc = excerpt(t.posts?.[0]?.contentMd ?? t.title, 200);
    return {
      id: url,
      url,
      title: t.title,
      content_text: desc,
      date_published: new Date(t.posts?.[0]?.createdAt ?? t.lastPostAt).toISOString(),
      date_modified: new Date(t.lastPostAt).toISOString(),
      authors: [{ name: t.author.username }],
      tags: [t.board.name],
    };
  });

  const json = {
    version: "https://jsonfeed.org/version/1.1",
    title: "SHUAI GAY 论坛",
    home_page_url: `${base}/`,
    feed_url: `${base}/feed.json`,
    description: "综合讨论 · 技术交流 · 生活分享 · 资源互助 — SHUAI GAY 社区的最新主题",
    language: "zh-CN",
    items,
  };

  return Response.json(json, {
    headers: {
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
