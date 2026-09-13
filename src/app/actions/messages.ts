"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { containsSensitive } from "@/lib/sensitive";
import { assertNotBanned } from "@/lib/ban";
import { logger } from "@/lib/logger";
import { isBlockedBetween } from "@/lib/block";
import { maybeEmailNotify } from "@/lib/email-notify";
import { after } from "next/server";
import { revalidatePath } from "next/cache";

const contentSchema = z.string().trim().min(1).max(5000);

/**
 * 私信发送(极简版 DirectMessage):
 * - 需登录
 * - 校验内容、敏感词、限流
 * - 不能给自己发
 * - 写入后重定向到对话页
 */
export async function sendMessageAction(formData: FormData): Promise<string> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);

  const receiverUsername = String(formData.get("receiverUsername") ?? "").trim();
  const content = contentSchema.safeParse(formData.get("content"));
  if (!receiverUsername || !content.success) {
    logger.warn("message.invalid_payload", { senderId: user.id, receiverUsername });
    return `/messages/${encodeURIComponent(receiverUsername || "")}?error=invalid`;
  }
  if (await containsSensitive(content.data)) {
    const ip = await clientIp();
    logger.info("moderation.blocked_sensitive", { userId: user.id, action: "sendMessage", ip });
    return `/messages/${encodeURIComponent(receiverUsername)}?error=sensitive`;
  }

  const receiver = await db.user.findUnique({
    where: { username: receiverUsername },
    select: { id: true, username: true, deletedAt: true },
  });
  if (!receiver || receiver.deletedAt) {
    logger.warn("message.receiver_not_found", { senderId: user.id, receiverUsername });
    return "/messages?error=user_not_found";
  }
  // 任一方屏蔽即不可私信
  if (await isBlockedBetween(user.id, receiver.id)) {
    logger.info("message.blocked", { senderId: user.id, receiverId: receiver.id });
    return `/messages/${encodeURIComponent(receiverUsername)}?error=blocked`;
  }
  if (receiver.id === user.id) {
    logger.warn("message.send_self", { senderId: user.id });
    return `/messages/${encodeURIComponent(receiverUsername)}?error=self`;
  }

  const ip = await clientIp();
  if (
    !(await checkRateLimit(`dm:${user.id}`, 10, 60)) ||
    !(await checkRateLimit(`dm:ip:${ip}`, 20, 60))
  ) {
    logger.warn("message.ratelimited", { senderId: user.id, ip });
    return `/messages/${encodeURIComponent(receiverUsername)}?error=ratelimited`;
  }

  try {
    await db.directMessage.create({
      data: {
        senderId: user.id,
        receiverId: receiver.id,
        contentMd: content.data,
      },
    });
    logger.info("message.send", { senderId: user.id, receiverId: receiver.id, ip });
    after(() =>
      maybeEmailNotify({
        userId: receiver.id,
        subject: `${user.username} 给你发了私信`,
        body: `${user.username} 给你发了私信：${content.data.slice(0, 80)}`,
        link: `/messages/${encodeURIComponent(user.username)}`,
      }),
    );
  } catch (e) {
    logger.error("message.send_failed", { senderId: user.id, receiverId: receiver.id, error: String(e), ip });
    throw e;
  }

  return `/messages/${encodeURIComponent(receiverUsername)}`;
}

/** 从自己的记录删除；发送后 10 分钟内可撤回并让双方都不可见。 */
export async function deleteMessageAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/messages");
  const messageId = String(formData.get("messageId") ?? "");
  const other = String(formData.get("other") ?? "");
  const mode = formData.get("mode") === "retract" ? "retract" : "hide";
  const message = await db.directMessage.findUnique({ where: { id: messageId } });
  if (!message || (message.senderId !== user.id && message.receiverId !== user.id)) redirect("/messages");

  if (mode === "retract") {
    const withinWindow = Date.now() - message.createdAt.getTime() <= 10 * 60_000;
    if (message.senderId !== user.id || !withinWindow) redirect(`/messages/${encodeURIComponent(other)}?error=retract_expired`);
    await db.directMessage.delete({ where: { id: message.id } });
  } else if (message.senderId === user.id) {
    await db.directMessage.update({ where: { id: message.id }, data: { senderDeletedAt: new Date() } });
  } else {
    await db.directMessage.update({ where: { id: message.id }, data: { receiverDeletedAt: new Date() } });
  }
  logger.info("message.deleted", { userId: user.id, messageId, mode });
  revalidatePath("/messages");
  revalidatePath(`/messages/${other}`);
  redirect(`/messages/${encodeURIComponent(other)}`);
}
