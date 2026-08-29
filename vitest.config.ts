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
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
