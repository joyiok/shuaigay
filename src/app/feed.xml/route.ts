import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";
export const revalidate = 600;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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
        posts: { orderBy: { createdAt: "asc" }, take: 1, select: { contentMd: true } },
      },
    })
    .catch(() => [] as any[]);

  const now = new Date().toUTCString();
  const items = threads
    .map((t: any) => {
      const slug = slugify(t.title);
      const link = `${base}/t/${t.id}-${slug}`;
      const desc = excerpt(t.posts?.[0]?.contentMd ?? t.title, 200);
      const pubDate = new Date(t.lastPostAt).toUTCString();
      return `  <item>
    <title>${esc(t.title)}</title>
    <link>${esc(link)}</link>
    <guid isPermaLink="true">${esc(link)}</guid>
    <description>${esc(desc)}</description>
    <author>${esc(t.author.username)}</author>
    <category>${esc(t.board.name)}</category>
    <pubDate>${pubDate}</pubDate>
  </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>SHUAI GAY 论坛</title>
  <link>${esc(base)}/</link>
  <description>综合讨论 · 技术交流 · 生活分享 · 资源互助 — SHUAI GAY 社区的最新主题</description>
  <language>zh-CN</language>
  <lastBuildDate>${now}</lastBuildDate>
  <atom:link href="${esc(base)}/rss.xml" rel="self" type="application/rss+xml" />
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
