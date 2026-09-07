import { afterEach, expect, it, vi } from "vitest";
import { verifyTurnstile } from "@/lib/turnstile";

const TEST_SECRET = "1x0000000000000000000000000000000AA";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function siteverify(data: object) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(data)));
}

it("同时校验 action 与 hostname", async () => {
  vi.stubEnv("TURNSTILE_SECRET_KEY", "real-secret");
  vi.stubEnv("TURNSTILE_HOSTNAMES", "shuai.gay,www.shuai.gay");
  vi.stubEnv("TURNSTILE_TEST_MODE", "");
  siteverify({ success: true, action: "login", hostname: "shuai.gay" });
  await expect(verifyTurnstile("token", "127.0.0.1", "login")).resolves.toBe(true);

  siteverify({ success: true, action: "signup", hostname: "shuai.gay" });
  await expect(verifyTurnstile("token", "127.0.0.1", "login")).resolves.toBe(false);

  siteverify({ success: true, action: "login", hostname: "attacker.example" });
  await expect(verifyTurnstile("token", "127.0.0.1", "login")).resolves.toBe(false);
});

it("官方测试密钥仅在显式测试模式放行", async () => {
  vi.stubEnv("TURNSTILE_SECRET_KEY", TEST_SECRET);
  vi.stubEnv("TURNSTILE_HOSTNAMES", "example.com");
  vi.stubEnv("TURNSTILE_TEST_MODE", "");
  siteverify({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });
  await expect(verifyTurnstile("token", "local", "login")).resolves.toBe(false);

  vi.stubEnv("TURNSTILE_TEST_MODE", "1");
  siteverify({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });
  await expect(verifyTurnstile("token", "local", "login")).resolves.toBe(true);
});
