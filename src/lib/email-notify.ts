/**
 * 邮件提醒：把「回复 / @提及 / 私信」这类通知同步发一封邮件。
 * 三道闸门，避免变成骚扰邮件：
 *   1. 用户开启了 emailNotify（默认关闭）
 *   2. 用户当前不在线（最近 10 分钟无活跃）
 *   3. 同一用户 10 分钟最多一封（Redis 限流）
 */
import { db } from "./db";
import { getRedis } from "./redis";
import { logger } from "./logger";
import { sendMail } from "./email";

const OFFLINE_AFTER_MS = 10 * 60_000;
const THROTTLE_SECONDS = 600;

function siteOrigin(): string {
  return (process.env.SITE_URL ?? "https://shuai.gay").replace(/\/$/, "");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface EmailNotifyInput {
  userId: string;
  subject: string;
  body: string;
  link?: string;
}

/** 返回是否真的发出（失败一律静默，不影响站内通知） */
export async function maybeEmailNotify(input: EmailNotifyInput): Promise<boolean> {
  try {
    if (!process.env.SMTP_URL) return false; // 没配 SMTP 就只走站内

    const user = await db.user
      .findUnique({
        where: { id: input.userId },
        select: { email: true, emailVerified: true, emailNotify: true, username: true, lastActiveAt: true },
      })
      .catch(() => null);
    if (!user || !user.emailNotify) return false;

    // 在线就不发邮件（站内通知已经能看到）
    if (user.lastActiveAt && Date.now() - user.lastActiveAt.getTime() < OFFLINE_AFTER_MS) return false;

    const redis = getRedis();
    if (redis) {
      const key = `mailnotify:${input.userId}`;
      const got = await redis.set(key, "1", "EX", THROTTLE_SECONDS, "NX").catch(() => null);
      if (!got) return false;
    }

    const origin = siteOrigin();
    const link = input.link ? (input.link.startsWith("http") ? input.link : `${origin}${input.link}`) : origin;
    await sendMail({
      to: user.email,
      subject: input.subject,
      text: `${input.body}\n\n查看：${link}\n\n（不想收邮件提醒可在 ${origin}/settings 关闭）`,
      html: `<p>${escapeHtml(input.body)}</p><p><a href="${link}">点此查看</a></p><hr /><p style="font-size:12px;color:#888">不想收邮件提醒？到 <a href="${origin}/settings">账号设置</a> 关闭即可。</p>`,
    });
    logger.info("email.notify_sent", { userId: input.userId, subject: input.subject });
    return true;
  } catch (error) {
    logger.warn("email.notify_failed", { userId: input.userId, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
