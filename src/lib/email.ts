/**
 * 邮件发送:若配置 SMTP_URL 则用 nodemailer 真实发送,否则 console.log 模拟。
 * 明文 token 只出现在邮件链接里,库里只存哈希。
 */
import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { db } from "./db";
import { siteUrl } from "./site";
import { logger } from "./logger";

type MailOpts = {
  to: string;
  subject: string;
  text?: string;
  html: string;
};

let _transporter: unknown | null = null;

function getTransporter(): null | { sendMail: (opts: unknown) => Promise<unknown> } {
  const url = process.env.SMTP_URL;
  if (!url) return null;
  if (_transporter) return _transporter as never;
  try {
    const transporter = nodemailer.createTransport(url);
    _transporter = transporter;
    return transporter as never;
  } catch (e) {
    logger.warn("email transporter init failed, fallback to console.log", { error: String(e) });
    return null;
  }
}

export async function sendMail(opts: MailOpts): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM ?? `"SHUAI GAY 论坛" <noreply@forum.example.com>`;
  if (!transporter) {
    // 模拟发送:打印到容器日志,开发环境直接可见
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        msg: "email.mock",
        to: opts.to,
        subject: opts.subject,
        html: opts.html.slice(0, 2000),
      }),
    );
    logger.info("email.mock", { to: opts.to, subject: opts.subject });
    return;
  }
  try {
    await (transporter as { sendMail: (o: unknown) => Promise<unknown> }).sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    logger.info("email.sent", { to: opts.to, subject: opts.subject });
  } catch (e) {
    logger.error("email.send_failed", { to: opts.to, subject: opts.subject, error: String(e) });
    // 发送失败不抛错,避免阻断注册主流程(日志已记录,用户可在页面重试)
  }
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** 创建一次性令牌并落库,返回明文 raw(仅用于邮件链接) */
export async function createVerificationToken(
  userId: string,
  type: "VERIFY_EMAIL" | "RESET_PASSWORD",
  ttlHours: number,
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
  await db.verificationToken.create({
    data: { userId, tokenHash, type, expiresAt },
  });
  return raw;
}

/** 发送验证邮件:注册后调用 */
export async function sendVerificationEmail(to: string, rawToken: string): Promise<void> {
  const base = siteUrl().origin;
  const link = `${base}/verify-email?token=${encodeURIComponent(rawToken)}`;
  await sendMail({
    to,
    subject: "请验证你的邮箱 - SHUAI GAY 论坛",
    text: `欢迎注册！请点击链接验证邮箱：${link} (24小时内有效)`,
    html: `<p>欢迎注册 SHUAI GAY 论坛！</p><p>请点击下方链接验证邮箱（24 小时内有效）：</p><p><a href="${link}">${link}</a></p><p>若非本人操作请忽略。</p>`,
  });
}

/** 发送找回密码邮件 */
export async function sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
  const base = siteUrl().origin;
  const link = `${base}/reset?token=${encodeURIComponent(rawToken)}`;
  await sendMail({
    to,
    subject: "重置密码 - SHUAI GAY 论坛",
    text: `点击链接重置密码：${link} (1小时内有效)`,
    html: `<p>你申请了重置密码。</p><p><a href="${link}">点击此处重置密码</a>（1 小时内有效）</p><p>若非本人操作请忽略。</p>`,
  });
}

/** 校验一次性令牌,返回 userId 或 null;一次性使用,成功后删除 */
export async function consumeVerificationToken(
  rawToken: string,
  type: "VERIFY_EMAIL" | "RESET_PASSWORD",
): Promise<{ userId: string } | null> {
  const tokenHash = hashToken(rawToken);
  const record = await db.verificationToken.findUnique({ where: { tokenHash } });
  if (!record) return null;
  if (record.type !== type) return null;
  if (record.expiresAt < new Date()) {
    await db.verificationToken.delete({ where: { id: record.id } }).catch(() => {});
    return null;
  }
  await db.verificationToken.delete({ where: { id: record.id } }).catch(() => {});
  return { userId: record.userId };
}

/** 仅校验不消费(用于页面展示合法性) */
export async function peekVerificationToken(
  rawToken: string,
  type: "VERIFY_EMAIL" | "RESET_PASSWORD",
): Promise<{ userId: string; expiresAt: Date } | null> {
  const tokenHash = hashToken(rawToken);
  const record = await db.verificationToken.findUnique({ where: { tokenHash } });
  if (!record) return null;
  if (record.type !== type) return null;
  if (record.expiresAt < new Date()) return null;
  return { userId: record.userId, expiresAt: record.expiresAt };
}
