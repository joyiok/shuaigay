/**
 * Cloudflare Turnstile 服务端校验。
 * - 未配置 TURNSTILE_SECRET_KEY 时：开发环境放行不阻塞流程，
 *   生产环境直接拒绝——漏配 key 等于裸奔，必须 loud fail。
 * - token 缺失或校验失败返回 false,由调用方引导用户重试
 */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: FormDataEntryValue | null,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== "production";

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