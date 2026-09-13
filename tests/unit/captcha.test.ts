import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/cached", () => ({ getCachedSiteSettings: vi.fn() }));
vi.mock("@/lib/redis", () => ({ getRedis: vi.fn() }));

import { captchaSvg, createCaptchaChallenge, verifyCaptcha } from "@/lib/captcha";
import { getCachedSiteSettings } from "@/lib/cached";
import { getRedis } from "@/lib/redis";

const values = new Map<string, string>();
const redis = {
  set: vi.fn(async (key: string, value: string) => { values.set(key, value); return "OK"; }),
  getdel: vi.fn(async (key: string) => { const value = values.get(key) ?? null; values.delete(key); return value; }),
};

beforeEach(() => {
  values.clear();
  vi.clearAllMocks();
  vi.mocked(getCachedSiteSettings).mockResolvedValue({ captchaEnabled: true } as never);
  vi.mocked(getRedis).mockReturnValue(redis as never);
});

function form(id: string, answer: string): FormData {
  const data = new FormData();
  data.set("captcha-id", id);
  data.set("captcha-answer", answer);
  return data;
}

it("验证码一次有效，并绑定操作类型", async () => {
  const id = "a".repeat(24);
  const hash = createHash("sha256").update("23456").digest("hex");
  values.set(`captcha:${id}`, `login:${hash}`);
  await expect(verifyCaptcha(form(id, "23456"), "login")).resolves.toBe(true);
  await expect(verifyCaptcha(form(id, "23456"), "login")).resolves.toBe(false);

  values.set(`captcha:${id}`, `signup:${hash}`);
  await expect(verifyCaptcha(form(id, "23456"), "login")).resolves.toBe(false);
});

it("关闭后放行，开启但存储不可用时拒绝", async () => {
  vi.mocked(getCachedSiteSettings).mockResolvedValue({ captchaEnabled: false } as never);
  await expect(verifyCaptcha(new FormData(), "login")).resolves.toBe(true);
  vi.mocked(getCachedSiteSettings).mockResolvedValue({ captchaEnabled: true } as never);
  vi.mocked(getRedis).mockReturnValue(null);
  await expect(verifyCaptcha(form("a".repeat(24), "23456"), "login")).resolves.toBe(false);
});

it("生成不含文本节点的五位数字图", async () => {
  const svg = captchaSvg("23456");
  expect(svg).toContain("<svg");
  expect(svg).toContain("<rect");
  expect(svg).not.toContain("<text");
  const challenge = await createCaptchaChallenge("create_thread");
  expect(challenge?.id).toMatch(/^[A-Za-z0-9_-]{24}$/);
  expect(challenge?.answer).toMatch(/^\d{5}$/);
});
