import { NextRequest } from "next/server";
import { createCaptchaChallenge, isCaptchaAction, isCaptchaEnabled } from "@/lib/captcha";
import { checkRateLimit } from "@/lib/ratelimit";

export async function GET(req: NextRequest): Promise<Response> {
  const testMode = process.env.CAPTCHA_TEST_MODE === "1";
  if (!(await isCaptchaEnabled())) return new Response("disabled", { status: 404 });
  const action = req.nextUrl.searchParams.get("action") ?? "";
  if (!isCaptchaAction(action)) return new Response("invalid action", { status: 400 });
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean);
  const ip = req.headers.get("cf-connecting-ip")?.trim() || forwarded?.at(-1) || "local";
  if (!testMode && !(await checkRateLimit(`captcha:${ip}`, 60, 60))) return new Response("too many requests", { status: 429 });
  const challenge = await createCaptchaChallenge(action);
  if (!challenge) return new Response("captcha unavailable", { status: 503 });
  return new Response(challenge.svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Captcha-Id": challenge.id,
      ...(testMode ? { "X-Captcha-Answer": challenge.answer } : {}),
    },
  });
}
