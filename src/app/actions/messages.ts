"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { containsSensitive } from "@/lib/sensitive";
import { assertNotBanned } from "@/lib/ban";

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
    redirect(`/messages/${encodeURIComponent(receiverUsername || "")}?error=invalid`);
  }
  if (await containsSensitive(content.data)) {
    redirect(`/messages/${encodeURIComponent(receiverUsername)}?error=sensitive`);
  }

  const receiver = await db.user.findUnique({
    where: { username: receiverUsername },
    select: { id: true, username: true },
  });
  if (!receiver) redirect(`/messages?error=user_not_found`);
  if (receiver.id === user.id) redirect(`/messages/${encodeURIComponent(receiverUsername)}?error=self`);

  const ip = await clientIp();
  if (
    !(await checkRateLimit(`dm:${user.id}`, 10, 60)) ||
    !(await checkRateLimit(`dm:ip:${ip}`, 20, 60))
  ) {
    redirect(`/messages/${encodeURIComponent(receiverUsername)}?error=ratelimited`);
  }

  await db.directMessage.create({
    data: {
      senderId: user.id,
      receiverId: receiver.id,
      contentMd: content.data,
    },
  });

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
  if (!sender) redirect("/messages");
  await db.directMessage.updateMany({
    where: { senderId: sender.id, receiverId: user.id, read: false },
    data: { read: true },
  });
  redirect(`/messages/${encodeURIComponent(fromUsername)}`);
}
