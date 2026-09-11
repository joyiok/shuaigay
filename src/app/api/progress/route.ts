import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveProgress } from "@/lib/reading-progress";
import { checkRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 阅读进度上报：小说按章、普通主题按楼层。
 * 客户端在翻章时调用，失败不影响阅读，因此一律 204。
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  let body: { threadId?: string; postId?: string; chapter?: number } | null = null;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const threadId = typeof body?.threadId === "string" ? body.threadId : "";
  if (!threadId) return new NextResponse(null, { status: 400 });

  // 同一用户 5 秒内只写一次，避免快速翻章打爆数据库
  if (!(await checkRateLimit(`progress:${user.id}`, 30, 60))) {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  await saveProgress({
    userId: user.id,
    threadId,
    postId: typeof body?.postId === "string" ? body.postId : null,
    chapter: Number.isFinite(body?.chapter) ? Number(body?.chapter) : 0,
  }).catch(() => {});

  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
