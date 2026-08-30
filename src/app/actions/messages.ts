"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { containsSensitive } from "@/lib/sensitive";
import { assertNotBanned } from "@/lib/ban";
import { logger } from "@/lib/logger";

const contentSchema = z.string().trim().min(1).max(5000);

/**
 * 私信发送(极简版 DirectMessage):
 * - 需登录
 * - 校验内容、敏感词、限流
 * - 不能给自己发
 * - 写入后重定向到对话页
 */
export async function sendMessageAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);

  const receiverUsername = String(formData.get("receiverUsername") ?? "").trim();
  const content = contentSchema.safeParse(formData.get("content"));
  if (!receiverUsername || !content.success) {
    logger.warn("message.invalid_payload", { senderId: user.id, receiverUsername });
    redirect(`/messages/${encodeURIComponent(receiverUsername || "")}?error=invalid`);
  }
  if (await containsSensitive(content.data)) {
    const ip = await clientIp();
    logger.info("moderation.blocked_sensitive", { userId: user.id, action: "sendMessage", ip });
    redirect(`/messages/${encodeURIComponent(receiverUsername)}?error=sensitive`);
  }

  const receiver = await db.user.findUnique({
    where: { username: receiverUsername },
    select: { id: true, username: true },
  });
  if (!receiver) {
    logger.warn("message.receiver_not_found", { senderId: user.id, receiverUsername });
    redirect(`/messages?error=user_not_found`);
  }
  if (receiver.id === user.id) {
    logger.warn("message.send_self", { senderId: user.id });
    redirect(`/messages/${encodeURIComponent(receiverUsername)}?error=self`);
  }

  const ip = await clientIp();
  if (
    !(await checkRateLimit(`dm:${user.id}`, 10, 60)) ||
    !(await checkRateLimit(`dm:ip:${ip}`, 20, 60))
  ) {
    logger.warn("message.ratelimited", { senderId: user.id, ip });
    redirect(`/messages/${encodeURIComponent(receiverUsername)}?error=ratelimited`);
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
  } catch (e) {
    logger.error("message.send_failed", { senderId: user.id, receiverId: receiver.id, error: String(e), ip });
    throw e;
  }

  redirect(`/messages/${encodeURIComponent(receiverUsername)}`);
}

export async function markReadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const fromUsername = String(formData.get("fromUsername") ?? "").trim();
  if (!fromUsername) redirect("/messages");
  const sender = await db.user.findUnique({
    where: { username: fromUsername },
    select: { id: true },
  });
  if (!sender) {
    logger.warn("message.mark_read_sender_not_found", { userId: user.id, fromUsername });
    redirect("/messages");
  }
  try {
    await db.directMessage.updateMany({
      where: { senderId: sender.id, receiverId: user.id, read: false },
      data: { read: true },
    });
    logger.info("message.mark_read", { userId: user.id, fromUsername, senderId: sender.id });
  } catch (e) {
    logger.error("message.mark_read_failed", { userId: user.id, fromUsername, error: String(e) });
    throw e;
  }
  redirect(`/messages/${encodeURIComponent(fromUsername)}`);
}
