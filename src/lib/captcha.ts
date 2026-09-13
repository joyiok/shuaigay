import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getCachedSiteSettings } from "./cached";
import { getRedis } from "./redis";

export const CAPTCHA_ACTIONS = ["login", "signup", "create_thread", "create_reply"] as const;
export type CaptchaAction = (typeof CAPTCHA_ACTIONS)[number];

const DIGITS = "23456789";
const TTL_SECONDS = 300;
const SEGMENTS: Record<string, readonly number[]> = {
  0: [0, 1, 2, 3, 4, 5],
  1: [1, 2],
  2: [0, 1, 6, 4, 3],
  3: [0, 1, 6, 2, 3],
  4: [5, 6, 1, 2],
  5: [0, 5, 6, 2, 3],
  6: [0, 5, 6, 4, 2, 3],
  7: [0, 1, 2],
  8: [0, 1, 2, 3, 4, 5, 6],
  9: [0, 1, 5, 6, 2, 3],
};
const RECTS = [
  [4, 2, 14, 3], [18, 5, 3, 12], [18, 19, 3, 12], [4, 31, 14, 3],
  [1, 19, 3, 12], [1, 5, 3, 12], [4, 16, 14, 3],
] as const;

function answerHash(answer: string): string {
  return createHash("sha256").update(answer).digest("hex");
}

export function isCaptchaAction(value: string): value is CaptchaAction {
  return CAPTCHA_ACTIONS.includes(value as CaptchaAction);
}

export async function isCaptchaEnabled(): Promise<boolean> {
  return (await getCachedSiteSettings()).captchaEnabled;
}

export function captchaSvg(code: string): string {
  const digits = [...code].map((digit, index) => {
    const rects = (SEGMENTS[digit] ?? []).map((segment) => {
      const [x, y, width, height] = RECTS[segment]!;
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="1.4"/>`;
    }).join("");
    return `<g transform="translate(${8 + index * 27} 6) rotate(${randomInt(15) - 7} 11 18)">${rects}</g>`;
  }).join("");
  const noise = Array.from({ length: 7 }, () =>
    `<path d="M${randomInt(150)} ${randomInt(48)} L${randomInt(150)} ${randomInt(48)}"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="48" viewBox="0 0 150 48"><title>五位数字验证码</title><rect width="150" height="48" rx="8" fill="#fffaf0"/><g stroke="#d5c9b8" stroke-width="1" opacity=".75">${noise}</g><g fill="#111114">${digits}</g></svg>`;
}

export async function createCaptchaChallenge(action: CaptchaAction): Promise<{ id: string; svg: string; answer: string } | null> {
  const redis = getRedis();
  if (!redis) return null;
  const answer = Array.from({ length: 5 }, () => DIGITS[randomInt(DIGITS.length)]).join("");
  const id = randomBytes(18).toString("base64url");
  const stored = `${action}:${answerHash(answer)}`;
  const saved = await redis.set(`captcha:${id}`, stored, "EX", TTL_SECONDS, "NX").catch(() => null);
  return saved === "OK" ? { id, svg: captchaSvg(answer), answer } : null;
}

export async function verifyCaptcha(formData: FormData, action: CaptchaAction): Promise<boolean> {
  if (!(await isCaptchaEnabled())) return true;
  const id = String(formData.get("captcha-id") ?? "").trim();
  const answer = String(formData.get("captcha-answer") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{24}$/.test(id) || !/^\d{5}$/.test(answer)) return false;
  const redis = getRedis();
  if (!redis) return false;
  const stored = await redis.getdel(`captcha:${id}`).catch(() => null);
  if (!stored?.startsWith(`${action}:`)) return false;
  const expected = Buffer.from(stored.slice(action.length + 1), "hex");
  const actual = Buffer.from(answerHash(answer), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
