import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UNREAD_CACHE_TTL_SEC = 8;

/** 未读数：优先读 Redis 短缓存（8s）， miss 才查库并回填；Redis 挂了直接查库。 */
async function getUnreadCached(userId: string): Promise<number> {
  const redis = getRedis();
  const key = `unread:${userId}`;
  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit !== null) {
        const n = Number(hit);
        if (Number.isFinite(n) && n >= 0) return Math.floor(n);
      }
    } catch {}
  }
  const unread = await db.notification.count({ where: { userId, read: false } });
  if (redis) {
    try {
      await redis.set(key, String(unread), "EX", UNREAD_CACHE_TTL_SEC);
    } catch {}
  }
  return unread;
}

/** SSE 推送未读数变化；EventSource 断线会自动重连，客户端仍保留低频轮询兜底。 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let last = -1;

  const stream = new ReadableStream({
    start(controller) {
      const tick = async () => {
        if (closed) return;
        try {
          const unread = await getUnreadCached(user.id);
          if (unread !== last) {
            last = unread;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ unread })}\n\n`));
          } else {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          }
        } catch {
          controller.enqueue(encoder.encode(": retry\n\n"));
        }
        timer = setTimeout(tick, 3_000);
      };
      void tick();
      request.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearTimeout(timer);
        controller.close();
      }, { once: true });
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
