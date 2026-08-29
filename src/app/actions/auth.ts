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
});

export async function registerAction(formData: FormData): Promise<void> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/register?error=invalid");
  const { email, username, password } = parsed.data;

  const ip = await clientIp();
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

  const user = await db.user.create({
    data: { email, username, passwordHash: await hashPassword(password) },
  });
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
