import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";

function requestIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const parts =
    req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return parts.length ? parts[parts.length - 1]! : "unknown";
}

/**
 * @提及补全的用户搜索:GET /api/users/search?q=xxx
 * 返回最多 8 个匹配用户名(公开信息,无需登录)。
 */
export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q || q.length > 20) return Response.json({ users: [] });
  // 公开枚举接口，按 IP 限流防用户名枚举/扫库
  if (!(await checkRateLimit(`users-search:${requestIp(req)}`, 60, 60))) {
    return Response.json({ users: [] }, { status: 429 });
  }

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
