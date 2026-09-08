"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertNotBanned } from "@/lib/ban";
import { logger } from "@/lib/logger";
import { filterRowsByPreferences, prefsFromForm } from "@/lib/notifications";
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
  revalidatePath("/settings");
}

/**
 * 更新通知偏好(仅本人);未勾选即关闭,立即生效。
 * 不在这里 redirect:表单用 SettingsForm 提交后整页跳转,避免 Next 15
 * 「同路径不同查询参数」的 action 重定向把正文留成空 Suspense 占位。
 */
export async function updateNotificationPrefsAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const prefs = prefsFromForm({
    reply: formData.get("reply"),
    follow: formData.get("follow"),
  });
  await db.user.update({ where: { id: user.id }, data: prefs });
  logger.info("user.notify_prefs_updated", { userId: user.id, ...prefs });
  revalidatePath("/settings");
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

/** 关注/取关用户(不能关注自己)。成功后不 redirect,由 ActionToggle 提交后刷新当前页 */
export async function toggleFollowAction(formData: FormData): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);

  const username = String(formData.get("username") ?? "");
  const target = await db.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });
  if (!target || target.id === user.id) return false;

  const existing = await db.follow.findUnique({
    where: { followerId_followingId: { followerId: user.id, followingId: target.id } },
  });
  let nowFollowing: boolean;
  if (existing) {
    await db.follow.delete({ where: { id: existing.id } });
    nowFollowing = false;
    logger.info("follow.remove", { userId: user.id, followingId: target.id });
  } else {
    await db.follow.create({ data: { followerId: user.id, followingId: target.id } });
    const rows = await filterRowsByPreferences([
      {
        userId: target.id,
        type: "follow",
        title: `${user.username} 关注了你`,
        link: `/u/${encodeURIComponent(user.username)}`,
      },
    ]);
    if (rows.length) await db.notification.createMany({ data: rows }).catch(() => {});
    nowFollowing = true;
    logger.info("follow.add", { userId: user.id, followingId: target.id });
  }

  revalidatePath(`/u/${encodeURIComponent(target.username)}`);
  return nowFollowing;
}
