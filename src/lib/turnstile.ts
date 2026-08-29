/**
 * Cloudflare Turnstile 服务端校验。
 * - 未配置 TURNSTILE_SECRET_KEY(本地开发)时直接放行,不阻塞开发流程
 * - token 缺失或校验失败返回 false,由调用方引导用户重试
 */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: FormDataEntryValue | null,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;

  const value = typeof token === "string" ? token.trim() : "";
  if (!value) return false;

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: value,
        ...(ip && ip !== "local" ? { remoteip: ip } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // 验证服务不可达时保守拒绝,避免裸奔
    return false;
  }
}