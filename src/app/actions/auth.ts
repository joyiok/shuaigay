"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  createSession,
  destroyOtherSessions,
  destroySession,
  getCurrentUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { passwordSchema } from "@/lib/password";
import { verifyTurnstile } from "@/lib/turnstile";
import { consumeInvite } from "@/lib/invite";
import { createVerificationToken, sendVerificationEmail, sendPasswordResetEmail, consumeVerificationToken } from "@/lib/email";
import { logger } from "@/lib/logger";
import { isUserBanned } from "@/lib/ban";

// 用户不存在时也做一次同价哈希比较,防止时序侧信道探测邮箱是否已注册
// 成本与 hashPassword 一致（BCRYPT_ROUNDS），否则比较耗时不同就露馅了
import { BCRYPT_ROUNDS } from "@/lib/auth";
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer", BCRYPT_ROUNDS);

/** 只接受站内相对路径,防开放重定向 */
function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  username: z.string().regex(/^[a-zA-Z0-9_-]{3,20}$/),
  password: passwordSchema,
  invite: z.string().trim().regex(/^[a-zA-Z0-9]{4,32}$/).optional(),
});

const INVITE_BONUS_POINTS = 10;

// 限流阈值:生产用默认值(注册 5/时,登录 20/10分);本地调试或 e2e 反复跑可经 .env 调大
const REGISTER_RATE_LIMIT = Number(process.env.RATE_LIMIT_REGISTER) || 5;
const LOGIN_RATE_LIMIT = Number(process.env.RATE_LIMIT_LOGIN) || 20;

export async function registerAction(formData: FormData): Promise<void> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    username: formData.get("username"),
    password: formData.get("password"),
    invite: formData.get("invite") || undefined,
  });
  if (!parsed.success) redirect("/register?error=invalid");
  const { email, username, password, invite: inviteCode } = parsed.data;

  const ip = await clientIp();
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response"), ip))) {
    redirect("/register?error=captcha_failed");
  }
  if (!(await checkRateLimit(`register:${ip}`, REGISTER_RATE_LIMIT, 3600))) {
    redirect("/register?error=ratelimited");
  }

  const existing = await db.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });
  if (existing) {
    // 不区分邮箱/用户名：防账号枚举
    redirect("/register?error=taken");
  }

  const inviteExists = inviteCode
    ? await db.invite.findUnique({
        where: { code: inviteCode },
        select: { id: true },
      })
    : null;
  if (inviteCode && !inviteExists) {
    redirect(`/register?invite=${encodeURIComponent(inviteCode)}&error=invite_invalid`);
  }

  const passwordHash = await hashPassword(password);
  let user: { id: string };
  try {
    user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, username, passwordHash, registrationIp: ip, lastLoginIp: ip, lastLoginAt: new Date(), lastActiveIp: ip, lastActiveAt: new Date() },
      });
      await tx.userIpLog.create({ data: { userId: u.id, ip, action: "register" } }).catch(() => {});
      if (inviteCode) {
        const inviterId = await consumeInvite(tx, inviteCode);
        if (!inviterId) {
          throw Object.assign(new Error("invite_used_up"), {
            code: "INVITE_USED_UP",
          });
        }
        await tx.user.update({
          where: { id: inviterId },
          data: { points: { increment: INVITE_BONUS_POINTS } },
        });
      }
      return u;
    });
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "INVITE_USED_UP") {
      redirect(`/register?invite=${encodeURIComponent(inviteCode ?? "")}&error=invite_invalid`);
    }
    throw e;
  }

  logger.info("auth.register", { userId: user.id, email, username, ip });
  // 非事务内补一次 IP 日志兜底（事务内已写，此处忽略错误）
  await db.userIpLog.create({ data: { userId: user.id, ip, action: "register" } }).catch(() => {});

  // 发送验证邮件(失败不阻断注册)
  try {
    const raw = await createVerificationToken(user.id, "VERIFY_EMAIL", 24);
    await sendVerificationEmail(email, raw);
    logger.info("auth.verification_sent", { userId: user.id, email });
  } catch (e) {
    logger.warn("auth.verification_failed", { userId: user.id, error: String(e) });
  }

  await createSession(user.id);
  // 注册成功后直接带 sent 标记进入验证页，满足「注册后邮件提示可见」
  redirect("/verify-email?sent=1");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(200),
  password: z.string().min(1).max(72),
});

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?error=invalid");
  const { email, password } = parsed.data;

  const ip = await clientIp();
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response"), ip))) {
    redirect("/login?error=captcha_failed");
  }
  if (!(await checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT, 600))) {
    redirect("/login?error=ratelimited");
  }

  const user = await db.user.findUnique({ where: { email } });
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, DUMMY_HASH);
  if (!ok || !user) {
    logger.info("auth.login_failed", { email, ip });
    redirect("/login?error=wrong");
  }

  // 封禁检查:被封用户登录时拒绝
  const ban = await isUserBanned(user.id);
  if (ban.banned) {
    logger.warn("auth.login_banned", { userId: user.id, email, reason: ban.ban?.reason });
    redirect("/login?error=banned");
  }

  logger.info("auth.login", { userId: user.id, email, ip });
  // 记录登录 IP
  await db.user.update({ where: { id: user.id }, data: { lastLoginIp: ip, lastLoginAt: new Date(), lastActiveIp: ip, lastActiveAt: new Date() } }).catch(() => {});
  await db.userIpLog.create({ data: { userId: user.id, ip, action: "login" } }).catch(() => {});
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  logger.info("auth.logout", {});
  redirect("/");
}

/* -------- 登录态自助改密码 -------- */

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema,
});

export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const back = `/u/${encodeURIComponent(user.username)}`;
  if (!(await checkRateLimit(`changepw:${user.id}`, 10, 3600))) {
    redirect(`${back}?error=ratelimited`);
  }
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) redirect(`${back}?error=invalid`);
  const { currentPassword, newPassword } = parsed.data;
  if (currentPassword === newPassword) redirect(`${back}?error=same_password`);
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!dbUser || !(await verifyPassword(currentPassword, dbUser.passwordHash))) {
    logger.warn("auth.password_change_denied", { userId: user.id });
    redirect(`${back}?error=wrong_password`);
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  const killed = await destroyOtherSessions(user.id);
  logger.info("auth.password_changed", { userId: user.id, killedSessions: killed });
  redirect(`${back}?ok=password_changed`);
}

/* -------- 找回密码 -------- */

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/forgot?error=invalid");
  const { email } = parsed.data;
  const ip = await clientIp();
  if (!(await checkRateLimit(`forgot:${ip}`, 5, 3600))) {
    redirect("/forgot?error=ratelimited");
  }
  const user = await db.user.findUnique({ where: { email } });
  // 始终提示已发送,防止邮箱枚举
  if (user) {
    try {
      const raw = await createVerificationToken(user.id, "RESET_PASSWORD", 1);
      await sendPasswordResetEmail(email, raw);
      logger.info("auth.reset_requested", { userId: user.id, email, ip });
    } catch (e) {
      logger.warn("auth.reset_failed", { email, error: String(e) });
    }
  } else {
    logger.info("auth.reset_requested_no_user", { email, ip });
  }
  redirect("/forgot?sent=1");
}

const resetSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/reset?error=invalid");
  const { token, password } = parsed.data;
  const ip = await clientIp();
  if (!(await checkRateLimit(`reset:${ip}`, 10, 3600))) {
    redirect("/reset?error=ratelimited");
  }
  const res = await consumeVerificationToken(token, "RESET_PASSWORD");
  if (!res) redirect("/reset?error=token_invalid");
  const passwordHash = await hashPassword(password);
  await db.user.update({ where: { id: res.userId }, data: { passwordHash } });
  // 使旧会话失效,可选:删除所有 session
  await db.session.deleteMany({ where: { userId: res.userId } });
  logger.info("auth.password_reset", { userId: res.userId });
  redirect("/login?reset=1");
}

export async function verifyEmailAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/verify-email?error=invalid");
  const res = await consumeVerificationToken(token, "VERIFY_EMAIL");
  if (!res) redirect("/verify-email?error=token_invalid");
  await db.user.update({ where: { id: res.userId }, data: { emailVerified: true } });
  logger.info("auth.email_verified", { userId: res.userId });
  redirect("/verify-email?ok=1");
}

export async function resendVerificationAction(): Promise<void> {
  // 需要登录态才能重发
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { email: true, emailVerified: true } });
  if (!dbUser) redirect("/login");
  if (dbUser.emailVerified) redirect("/?verified=already");
  const ip = await clientIp();
  if (!(await checkRateLimit(`resend:${user.id}`, 3, 3600))) redirect("/verify-email?error=ratelimited");
  const raw = await createVerificationToken(user.id, "VERIFY_EMAIL", 24);
  await sendVerificationEmail(dbUser.email, raw);
  logger.info("auth.verification_resent", { userId: user.id });
  redirect("/verify-email?sent=1");
}
