import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "./db";

const SESSION_COOKIE = "session";
const SESSION_TTL_DAYS = 30;

export type SessionUser = {
  id: string;
  username: string;
  email: string;
  role: "USER" | "ADMIN";
  avatarUrl: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// bcrypt 成本：生产默认 12；测试/本地 e2e 可设 BCRYPT_ROUNDS=4 提速
// （bcryptjs 纯 JS 实现，cost 12 单次 ~200ms+ 阻塞事件循环，并发注册时单机直接被打满）
const BCRYPT_ROUNDS = Math.min(14, Math.max(4, Number(process.env.BCRYPT_ROUNDS ?? 12) || 12));
export { BCRYPT_ROUNDS };

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 改密成功后踢掉其它会话：本会话 cookie 保留，其它设备需重登 */
export async function destroyOtherSessions(userId: string): Promise<number> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const whereMe = token ? { NOT: { tokenHash: hashToken(token) } } : {};
  const r = await db.session
    .deleteMany({ where: { userId, ...whereMe } })
    .catch(() => ({ count: 0 }));
  return r.count;
}

export async function createSession(userId: string): Promise<void> {
  // token 本体只存 cookie,库里只存哈希:拖库也伪造不了会话
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  // 记录设备信息，设置页可查看并远程下线
  const h = await headers();
  const ip = (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 64);
  const ua = (h.get("user-agent") ?? "").slice(0, 300);
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, ip: ip || null, ua: ua || null },
  });
  const jar = await cookies();
  const forwardedProto = (await headers()).get("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase();
  const siteUrl = process.env.SITE_URL?.trim().toLowerCase();
  const secure = process.env.NODE_ENV === "production" && forwardedProto !== "http" && !siteUrl?.startsWith("http://");
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

/** 每个请求只查一次库(React cache 按请求去重) */
export const getCurrentUser = cache(
  async (): Promise<SessionUser | null> => {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const session = await db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    // 活跃时间：5 分钟粒度更新，供「登录设备」展示与邮件提醒判断在线状态
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
      void db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
      const u = session.user as unknown as { lastActiveAt?: Date | null };
      if (!u.lastActiveAt || Date.now() - u.lastActiveAt.getTime() > 5 * 60_000) {
        void db.user.update({ where: { id: session.user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
      }
    }
    return {
      id: session.user.id,
      username: session.user.username,
      email: session.user.email,
      role: session.user.role,
      avatarUrl: (session.user as unknown as { avatarUrl?: string | null }).avatarUrl ?? null,
    };
  },
);
