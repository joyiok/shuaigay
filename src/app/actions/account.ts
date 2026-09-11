"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { createVerificationToken, sendEmailChangeEmail, sendEmailChangeNotice } from "@/lib/email";
import { logger } from "@/lib/logger";
import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email("邮箱格式不对").max(160);

/** 邮件提醒开关 */
export async function updateNotifyPrefsAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");
  const emailNotify = formData.get("emailNotify") === "on" || formData.get("emailNotify") === "1";
  await db.user.update({ where: { id: user.id }, data: { emailNotify } });
  logger.info("account.email_notify", { userId: user.id, emailNotify });
  redirect("/settings?ok=notify_saved");
}

/** 下线指定设备（会话） */
export async function revokeSessionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) redirect("/settings");
  // 只能下线自己的会话；当前会话不允许在这里踢（用退出登录）
  const jar = await cookies();
  const token = jar.get("session")?.value ?? "";
  const currentHash = token ? createHash("sha256").update(token).digest("hex") : "";
  await db.session
    .deleteMany({ where: { id: sessionId, userId: user.id, ...(currentHash ? { NOT: { tokenHash: currentHash } } : {}) } })
    .catch(() => {});
  logger.info("account.session_revoked", { userId: user.id, sessionId });
  revalidatePath("/settings");
  redirect("/settings");
}

/** 下线其它所有设备 */
export async function revokeOtherSessionsAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");
  const jar = await cookies();
  const token = jar.get("session")?.value ?? "";
  const currentHash = token ? createHash("sha256").update(token).digest("hex") : "";
  const removed = await db.session
    .deleteMany({ where: { userId: user.id, ...(currentHash ? { NOT: { tokenHash: currentHash } } : {}) } })
    .catch(() => ({ count: 0 }));
  logger.info("account.sessions_revoked_all", { userId: user.id, count: removed.count });
  revalidatePath("/settings");
  redirect("/settings?ok=sessions_revoked");
}

/** 换绑邮箱：往新邮箱发确认链接，确认后才生效 */
export async function updateEmailAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");
  const parsed = emailSchema.safeParse(formData.get("newEmail"));
  if (!parsed.success) redirect("/settings?error=email_invalid");
  const newEmail = parsed.data;

  const me = await db.user.findUnique({ where: { id: user.id }, select: { email: true } });
  if (!me) redirect("/login");
  if (me.email === newEmail) redirect("/settings?error=email_same");

  const taken = await db.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (taken) redirect("/settings?error=email_taken");

  const ip = await clientIp();
  if (!(await checkRateLimit(`email-change:${user.id}`, 3, 3600))) redirect("/settings?error=email_ratelimited");

  try {
    const raw = await createVerificationToken(user.id, "CHANGE_EMAIL", 24, newEmail);
    await sendEmailChangeEmail(newEmail, raw);
    // 给旧邮箱留一条提醒（失败不影响主流程）
    await sendEmailChangeNotice(me.email, newEmail).catch(() => {});
  } catch {
    redirect("/settings?error=email_failed");
  }
  logger.info("account.email_change_requested", { userId: user.id, ip });
  redirect("/settings?ok=email_sent");
}

/** 供 verify-email 页调用的换绑确认 */
export async function confirmEmailChangeAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/verify-email?error=invalid");
  const { consumeVerificationToken } = await import("@/lib/email");
  const result = await db.$transaction(async (tx) => {
    const record = await consumeVerificationToken(token, "CHANGE_EMAIL", tx);
    if (!record || !record.email) return null;
    const clash = await tx.user.findUnique({ where: { email: record.email }, select: { id: true } });
    if (clash && clash.id !== record.userId) return null;
    await tx.user.update({ where: { id: record.userId }, data: { email: record.email, emailVerified: true } });
    await tx.verificationToken.deleteMany({ where: { userId: record.userId, type: "CHANGE_EMAIL" } });
    return record.email;
  });
  if (!result) redirect("/verify-email?error=token_invalid");
  logger.info("account.email_changed", { email: result });
  redirect("/settings?ok=email_changed");
}
