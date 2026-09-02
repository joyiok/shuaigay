"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertNotBanned } from "@/lib/ban";
import { threadHref } from "@/lib/slug";
import { logger } from "@/lib/logger";

function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "";
}

export async function toggleFavoriteAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, title: true },
  });
  if (!thread) redirect("/");
  const existing = await db.favorite.findUnique({
    where: { userId_threadId: { userId: user.id, threadId } },
  });
  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } });
    logger.info("favorite.remove", { userId: user.id, threadId });
  } else {
    await db.favorite.create({ data: { userId: user.id, threadId } });
    logger.info("favorite.add", { userId: user.id, threadId });
  }
  const next = safeNext(formData.get("next"));
  redirect(next || threadHref(thread.id, thread.title));
}
