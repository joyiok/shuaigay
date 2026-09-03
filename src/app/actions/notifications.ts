"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";

/** 标记 1 条通知已读（只能动自己的，id 无效静默忽略） */
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/notifications");
  await db.notification
    .updateMany({ where: { id, userId: user.id }, data: { read: true } })
    .catch(() => null);
  logger.info("notification.read", { userId: user.id, id });
  revalidatePath("/notifications");
}

/** 标记全部通知已读 */
export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const r = await db.notification
    .updateMany({ where: { userId: user.id, read: false }, data: { read: true } })
    .catch(() => ({ count: 0 }));
  logger.info("notification.read_all", { userId: user.id, count: r.count });
  revalidatePath("/notifications");
}
