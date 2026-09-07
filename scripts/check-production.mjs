import { fileURLToPath } from "node:url";

export function checkProduction(env) {
  const errors = [];
  for (const key of ["DOMAIN", "SITE_URL", "POSTGRES_PASSWORD", "RESTIC_PASSWORD", "SMTP_URL", "MAIL_FROM", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD"]) {
    if (!env[key]?.trim()) errors.push(`${key} 未配置`);
  }
  try {
    const url = new URL(env.SITE_URL);
    if (url.protocol !== "https:" || url.hostname !== env.DOMAIN || /^(localhost|127\.0\.0\.1|.*example\.com)$/.test(url.hostname)) {
      errors.push("SITE_URL 必须使用正式 HTTPS 域名，并与 DOMAIN 一致");
    }
  } catch { errors.push("SITE_URL 不是有效网址"); }
  for (const key of ["POSTGRES_PASSWORD", "RESTIC_PASSWORD", "SEED_ADMIN_PASSWORD"]) {
    if ((env[key] ?? "").length < 12 || ["forum_dev_password", "dev-only-restic-pass", "changeme123", "ReleaseAdmin123!"].includes(env[key])) {
      errors.push(`${key} 必须替换为至少 12 位的独立生产口令`);
    }
  }
  for (const key of ["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]) {
    if (/^[123]x0{10}/.test(env[key] ?? "")) errors.push(`${key} 不能使用官方测试密钥上线`);
  }
  if (env.SMTP_URL && !/^smtps?:\/\//.test(env.SMTP_URL)) errors.push("SMTP_URL 必须以 smtp:// 或 smtps:// 开头");
  for (const key of ["MAIL_FROM", "SEED_ADMIN_EMAIL"]) {
    if (env[key] && (!env[key].includes("@") || /example\.com/.test(env[key]))) errors.push(`${key} 需要真实邮箱地址`);
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const errors = checkProduction(process.env);
  console.log(errors.length ? errors.map(error => `- ${error}`).join("\n") : "生产配置检查通过；请继续确认 DNS、邮件投递与真实验证码。");
  process.exitCode = errors.length ? 1 : 0;
}
