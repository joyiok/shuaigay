import path from "node:path";
import { defineConfig } from "vitest/config";

// 让 vitest 也能读到 .env 里的 DATABASE_URL / REDIS_URL，否则集成测试永远被 skip
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  // Vitest 不需要处理 Tailwind/PostCSS，避免加载 postcss.config.mjs 导致卡死
  css: {
    postcss: { plugins: [] },
  },
  test: {
    // 单元测试不涉及样式，直接禁用 css 处理
    css: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // 集成测试共用同一个数据库 / Redis / writerSetting 单行配置，
    // 并发跑会互相覆盖（曾导致「mock 模型指向别的用例的假服务器」偶发失败），
    // 因此逐个文件串行执行；单元测试本身很快，串行代价可忽略。
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
