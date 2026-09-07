import { test as base, expect } from "@playwright/test";

// 业务回归模拟官方测试 widget 的生命周期，服务端仍用官方测试 secret 调 Siteverify。
// 生产密钥不会接受此 token；不在应用代码添加跳过验证的开关。
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      let count = 0;
      const callbacks = new Map<string, (token: string) => void>();
      window.turnstile = {
        render(_element, options) {
          const id = String(++count);
          const callback = options.callback ?? (() => {});
          callbacks.set(id, callback);
          queueMicrotask(() => callback("XXXX.DUMMY.TOKEN.XXXX"));
          return id;
        },
        reset(id) { if (id) callbacks.get(id)?.("XXXX.DUMMY.TOKEN.XXXX"); },
        remove(id) { if (id) callbacks.delete(id); },
      };
    });
    await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js**", route => route.fulfill({ contentType: "application/javascript", body: "" }));
    await use(page);
  },
});
export { expect };
