import { db } from "@/lib/db";

/**
 * @提及补全的用户搜索:GET /api/users/search?q=xxx
 * 返回最多 8 个匹配用户名(公开信息,无需登录)。
 */
export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q || q.length > 20) return Response.json({ users: [] });

  const users = await db.user
    .findMany({
      where: { username: { contains: q, mode: "insensitive" } },
      select: { username: true },
      orderBy: { username: "asc" },
      take: 8,
    })
    .catch(() => []);

  return Response.json({ users: users.map((u) => u.username) });
}