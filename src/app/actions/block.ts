"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { blockUser, unblockUser } from "@/lib/block";
import { logger } from "@/lib/logger";

export async function blockUserAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const targetId = String(formData.get("targetId") ?? "");
  const username = String(formData.get("username") ?? "");
  const back = String(formData.get("back") ?? (username ? `/u/${encodeURIComponent(username)}` : "/"));
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!targetId || targetId === user.id) redirect(back);

  await blockUser(user.id, targetId);
  logger.info("block.add", { userId: user.id, targetId });
  revalidatePath(back);
  revalidatePath("/settings");
  redirect(back);
}

export async function unblockUserAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");
  const targetId = String(formData.get("targetId") ?? "");
  const back = String(formData.get("back") ?? "/settings");
  if (targetId) await unblockUser(user.id, targetId);
  logger.info("block.remove", { userId: user.id, targetId });
  revalidatePath(back);
  redirect(back);
}
