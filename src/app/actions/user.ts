"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertNotBanned } from "@/lib/ban";
import { logger } from "@/lib/logger";
import {
  INVITE_CODES_PER_USER,
  createInviteCode,
} from "@/lib/invite";

const bioSchema = z.string().trim().max(200);

/** 编辑自己的 bio(限本人,最多 200 字) */
export async function updateBioAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const bio = bioSchema.safeParse(formData.get("bio"));
  if (!bio.success) return;

  await db.user.update({ where: { id: user.id }, data: { bio: bio.data } });
  revalidatePath(`/u/${user.username}`);
}

/** 生成新邀请码:每人最多 5 个 */
export async function generateInviteAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const count = await db.invite.count({ where: { inviterId: user.id } });
  if (count >= INVITE_CODES_PER_USER) return;

  await createInviteCode(user.id);
  revalidatePath("/invite");
}

function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "";
}

/** 关注/取关用户(不能关注自己),操作后回到该用户主页 */
export async function toggleFollowAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);

  const username = String(formData.get("username") ?? "");
  const target = await db.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });
  if (!target || target.id === user.id) redirect("/");

  const existing = await db.follow.findUnique({
    where: { followerId_followingId: { followerId: user.id, followingId: target.id } },
  });
  if (existing) {
    await db.follow.delete({ where: { id: existing.id } });
    logger.info("follow.remove", { userId: user.id, followingId: target.id });
  } else {
    await db.follow.create({ data: { followerId: user.id, followingId: target.id } });
    logger.info("follow.add", { userId: user.id, followingId: target.id });
  }

  revalidatePath(`/u/${encodeURIComponent(target.username)}`);
  const next = safeNext(formData.get("next"));
  redirect(next || `/u/${encodeURIComponent(target.username)}`);
}