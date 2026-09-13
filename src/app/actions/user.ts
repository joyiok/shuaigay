"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertNotBanned } from "@/lib/ban";
import { logger } from "@/lib/logger";
import { blockersOf } from "@/lib/block";
import { maybeEmailNotify } from "@/lib/email-notify";
import { after } from "next/server";
import { filterRowsByPreferences, prefsFromForm } from "@/lib/notifications";
import {
  INVITE_CODES_PER_USER,
  createInviteCode,
} from "@/lib/invite";

const bioSchema = z.string().trim().max(200);
const titleSchema = z.string().trim().max(12);

/** 编辑自己的 bio(限本人,最多 200 字；被封禁不可改资料) */
export async function updateBioAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await assertNotBanned(user.id);

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

/**
 * 自设头衔：正式会员（积分达会员线）可设 2-12 字，管理员免门槛；
 * 空字符串 = 清除。敏感词拦截，长度超限静默截断前返回。
 */
export async function updateTitleAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);
  const raw = String(formData.get("customTitle") ?? "").trim();
  if (!raw) {
    await db.user.update({ where: { id: user.id }, data: { customTitle: null } });
    revalidatePath("/settings");
    revalidatePath(`/u/${user.username}`);
    return;
  }
  const parsed = titleSchema.safeParse(raw);
  if (!parsed.success || parsed.data.length < 2) return;
  const { containsSensitive } = await import("@/lib/sensitive");
  if (await containsSensitive(parsed.data)) return;
  // 会员线校验（管理员跳过）
  if (user.role !== "ADMIN") {
    const { getPointsConfig, DEFAULT_POINTS_CONFIG } = await import("@/lib/points-config");
    const cfg = await getPointsConfig().catch(() => DEFAULT_POINTS_CONFIG);
    const full = await db.user.findUnique({ where: { id: user.id }, select: { points: true } });
    if (!full || full.points < cfg.memberThreshold) return;
  }
  await db.user.update({ where: { id: user.id }, data: { customTitle: parsed.data } });
  logger.info("user.title_updated", { userId: user.id });
  revalidatePath("/settings");
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

/** 关注/取关用户(不能关注自己)。成功后不 redirect,由 ActionToggle 提交后刷新当前页 */
export async function toggleFollowAction(formData: FormData): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);

  const username = String(formData.get("username") ?? "");
  const target = await db.user.findUnique({
    where: { username },
    select: { id: true, username: true, deletedAt: true },
  });
  if (!target || target.deletedAt || target.id === user.id) return false;

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
    // 对方屏蔽了我就不再打扰
    const blockers = await blockersOf(user.id, [target.id]);
    const rows = blockers.has(target.id)
      ? []
      : await filterRowsByPreferences([
          {
            userId: target.id,
            type: "follow",
            title: `${user.username} 关注了你`,
            link: `/u/${encodeURIComponent(user.username)}`,
          },
        ]);
    if (rows.length) {
      await db.notification.createMany({ data: rows }).catch(() => {});
      after(() =>
        maybeEmailNotify({
          userId: target.id,
          subject: `${user.username} 关注了你`,
          body: `${user.username} 关注了你，点开看看对方的主页。`,
          link: `/u/${encodeURIComponent(user.username)}`,
        }),
      );
    }
    nowFollowing = true;
    logger.info("follow.add", { userId: user.id, followingId: target.id });
  }

  revalidatePath(`/u/${encodeURIComponent(target.username)}`);
  return nowFollowing;
}
