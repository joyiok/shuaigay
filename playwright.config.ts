import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
  },
  // 已有服务在跑就直接复用;否则自动 node standalone（output: standalone 时 next start 不可用）
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "PORT=3100 node .next/standalone/server.js",
        url: "http://localhost:3100",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
