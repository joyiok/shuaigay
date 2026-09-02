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
        posts: { orderBy: { createdAt: "asc" }, take: 1, select: { contentMd: true, createdAt: true } },
      },
    })
    .catch(() => [] as any[]);

  const updated = threads[0]?.lastPostAt ? new Date(threads[0].lastPostAt).toISOString() : new Date().toISOString();

  const entries = threads
    .map((t: any) => {
      const slug = slugify(t.title);
      const link = `${base}/t/${t.id}-${slug}`;
      const desc = excerpt(t.posts?.[0]?.contentMd ?? t.title, 200);
      const published = new Date(t.posts?.[0]?.createdAt ?? t.lastPostAt).toISOString();
      const updatedAt = new Date(t.lastPostAt).toISOString();
      return `  <entry>
    <title>${esc(t.title)}</title>
    <link href="${esc(link)}" />
    <id>${esc(link)}</id>
    <updated>${updatedAt}</updated>
    <published>${published}</published>
    <author><name>${esc(t.author.username)}</name></author>
    <category term="${esc(t.board.name)}" />
    <summary type="html"><![CDATA[${esc(desc)}]]></summary>
  </entry>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>SHUAI GAY 论坛</title>
  <subtitle>综合讨论 · 技术交流 · 生活分享 · 资源互助</subtitle>
  <link href="${esc(base)}/atom.xml" rel="self" />
  <link href="${esc(base)}/" />
  <updated>${updated}</updated>
  <id>${esc(base)}/</id>
${entries}
</feed>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
