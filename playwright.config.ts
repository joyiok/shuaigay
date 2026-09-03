import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
  },
  // 已有服务在跑就直接复用;否则自动起 standalone。注意 standalone 目录默认不含
  // .next/static，直接 node server.js 会导致 _next/static 404、页面无 JS 水合，
  // 因此启动前先把静态资源拷进去(幂等)。
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "cp -r .next/static .next/standalone/.next/static 2>/dev/null; PORT=3100 node .next/standalone/server.js",
        url: "http://localhost:3100",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
