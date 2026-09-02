"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertNotBanned } from "@/lib/ban";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { containsSensitive } from "@/lib/sensitive";
import { threadHref } from "@/lib/slug";
import { logger } from "@/lib/logger";

const RATE_RATE_LIMIT = Number(process.env.RATE_LIMIT_RATE) || 40;
const reasonSchema = z.string().trim().max(100);

export async function ratePostAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);

  const postId = String(formData.get("postId") ?? "");
  const rawValue = z.coerce.number().int().safeParse(formData.get("value"));
  if (!rawValue.success || (rawValue.data !== 1 && rawValue.data !== -1)) redirect("/");

  const reasonRaw = String(formData.get("reason") ?? "").trim();
  let reason: string | null = null;
  if (reasonRaw) {
    const parsed = reasonSchema.safeParse(reasonRaw);
    if (!parsed.success) redirect(`/t/${postId}?error=invalid`);
    if (await containsSensitive(parsed.data)) redirect(`/t/${postId}?error=reason_sensitive`);
    reason = parsed.data || null;
  }

  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      threadId: true,
      thread: { select: { id: true, title: true } },
    },
  });
  if (!post) redirect("/");
  if (post.authorId === user.id) {
    redirect(`${threadHref(post.thread.id, post.thread.title)}?error=self_rate#post-${post.id}`);
  }

  const ip = await clientIp();
  if (!(await checkRateLimit(`rate:${user.id}`, RATE_RATE_LIMIT, 60))) {
    redirect(`${threadHref(post.thread.id, post.thread.title)}?error=ratelimited#post-${post.id}`);
  }
  if (!(await checkRateLimit(`rate:ip:${ip}`, RATE_RATE_LIMIT, 60))) {
    redirect(`${threadHref(post.thread.id, post.thread.title)}?error=ratelimited#post-${post.id}`);
  }

  const existing = await db.postRating.findUnique({
    where: { postId_userId: { postId, userId: user.id } },
  });

  let isNewUp = false;
  if (existing) {
    if (existing.value === rawValue.data) {
      await db.postRating.delete({ where: { id: existing.id } });
      logger.info("post.rate_remove", { userId: user.id, postId, value: rawValue.data });
    } else {
      await db.postRating.update({
        where: { id: existing.id },
        data: { value: rawValue.data, reason },
      });
      isNewUp = rawValue.data === 1;
      logger.info("post.rate_switch", { userId: user.id, postId, value: rawValue.data });
    }
  } else {
    await db.postRating.create({
      data: { postId, userId: user.id, value: rawValue.data, reason },
    });
    isNewUp = rawValue.data === 1;
    logger.info("post.rate_add", { userId: user.id, postId, value: rawValue.data });
  }

  if (isNewUp) {
    try {
      await db.notification.create({
        data: {
          userId: post.authorId,
          type: "rate",
          title: `${user.username} 赞了你的楼层`,
          body: reason ?? undefined,
          link: `${threadHref(post.thread.id, post.thread.title)}#post-${post.id}`,
        },
      });
    } catch {}
  }

  redirect(`${threadHref(post.thread.id, post.thread.title)}#post-${post.id}`);
}
