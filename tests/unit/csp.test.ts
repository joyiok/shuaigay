import { afterEach, expect, it, vi } from "vitest";
import config from "../../next.config";

afterEach(() => vi.unstubAllEnvs());

it("只在开发环境允许脚本 eval，生产 CSP 仍保持限制", async () => {
  for (const mode of ["development", "production"] as const) {
    vi.stubEnv("NODE_ENV", mode);
    const rules = await config.headers!();
    const csp = rules.find((rule) => rule.source === "/:path*")!.headers.find((header) => header.key === "Content-Security-Policy")!.value;
    expect(csp.includes("'unsafe-eval'")).toBe(mode === "development");
    expect(csp).toContain("object-src 'none'");
  }
});
