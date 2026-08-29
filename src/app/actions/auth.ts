"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";

// 用户不存在时也做一次同价哈希比较,防止时序侧信道探测邮箱是否已注册
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer", 12);

/** 只接受站内相对路径,防开放重定向 */
function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  username: z.string().regex(/^[a-zA-Z0-9_-]{3,20}$/),
  password: z.string().min(8).max(72),
  // 邀请码是 8 位十六进制,宽松校验,格式不对直接当无效
  invite: z.string().trim().regex(/^[a-zA-Z0-9]{4,32}$/).optional(),
});

const INVITE_BONUS_POINTS = 10;

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
  if (!(await checkRateLimit(`register:${ip}`, 5, 3600))) {
    redirect("/register?error=ratelimited");
  }

  const existing = await db.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });
  if (existing) {
    redirect(
      existing.email === email
        ? "/register?error=email_taken"
        : "/register?error=username_taken",
    );
  }

  // 校验邀请码:存在且未超限;用条件更新原子占座,防并发超发
  const invite = inviteCode
    ? await db.invite.findUnique({
        where: { code: inviteCode },
        select: { id: true, inviterId: true, maxUses: true, usedCount: true },
      })
    : null;
  if (inviteCode && !invite) {
    redirect(`/register?invite=${encodeURIComponent(inviteCode)}&error=invite_invalid`);
  }

  const passwordHash = await hashPassword(password);
  let user: { id: string };
  try {
    user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, username, passwordHash },
      });
      if (invite) {
        // usedCount < maxUses 才真的消耗,失败返回 0 条 -> 已被抢完
        const consumed = await tx.invite.updateMany({
          where: { id: invite.id, usedCount: { lt: invite.maxUses } },
          data: { usedCount: { increment: 1 } },
        });
        if (consumed.count === 0) {
          throw Object.assign(new Error("invite_used_up"), {
            code: "INVITE_USED_UP",
          });
        }
        // 邀请人 +10 积分
        await tx.user.update({
          where: { id: invite.inviterId },
          data: { points: { increment: INVITE_BONUS_POINTS } },
        });
      }
      return u;
    });
  } catch (e) {
    // 邀请码恰好被抢完:事务回滚(新用户不落库),回注册页提示
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "INVITE_USED_UP") {
      redirect(`/register?invite=${encodeURIComponent(inviteCode ?? "")}&error=invite_invalid`);
    }
    throw e;
  }
  await createSession(user.id);
  redirect("/");
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
  if (!(await checkRateLimit(`login:${ip}`, 20, 600))) {
    redirect("/login?error=ratelimited");
  }

  const user = await db.user.findUnique({ where: { email } });
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, DUMMY_HASH);
  if (!ok || !user) redirect("/login?error=wrong");

  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
