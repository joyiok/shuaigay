import { afterEach, expect, it, vi } from "vitest";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: send }) } }));
vi.mock("@/lib/db", () => ({ db: {} }));
import { sendMail } from "@/lib/email";

afterEach(() => vi.unstubAllEnvs());

it("生产环境缺少 SMTP 或投递失败时不能报告发送成功", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SMTP_URL", "");
  const mail = { to: "test@example.com", subject: "test", html: "test" };
  await expect(sendMail(mail)).rejects.toThrow("SMTP_URL");
  vi.stubEnv("SMTP_URL", "smtp://localhost");
  send.mockRejectedValueOnce(new Error("delivery failed"));
  await expect(sendMail(mail)).rejects.toThrow("delivery failed");
});
