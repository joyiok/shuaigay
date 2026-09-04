import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // CI 机子慢：导航/动作后首 paint 经常超 5s，expect 超时放宽（本地保持 5s 快失败）
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  // 单机 standalone 扛不住多 worker 并发（bcrypt/发帖全挤一起必抖），CI 限 2 worker
  workers: process.env.CI ? 2 : undefined,
  // 共享机 CPU 抖动大（一次导航 0.1s 一次 20s），失败重试一次兜底
  retries: 1,
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
