"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertNotBanned } from "@/lib/ban";
import { logger } from "@/lib/logger";

/**
 * 收藏/取消收藏。成功后不 redirect：调用方用 ActionToggle 提交并 router.refresh()，
 * 避免「同 URL redirect 后客户端路由缓存不刷新」导致按钮态停在旧值。
 */
export async function toggleFavoriteAction(formData: FormData): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true },
  });
  if (!thread) return false;
  const existing = await db.favorite.findUnique({
    where: { userId_threadId: { userId: user.id, threadId } },
  });
  let nowFavorite: boolean;
  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } });
    nowFavorite = false;
    logger.info("favorite.remove", { userId: user.id, threadId });
  } else {
    await db.favorite.create({ data: { userId: user.id, threadId } });
    nowFavorite = true;
    logger.info("favorite.add", { userId: user.id, threadId });
  }
  revalidatePath("/settings");
  return nowFavorite;
}
