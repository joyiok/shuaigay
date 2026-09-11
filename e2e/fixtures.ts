import { test as base, expect } from "@playwright/test";
import type { Response } from "@playwright/test";

/**
 * 等表单 POST 落袋时用这个判定：埋点/心跳类请求（/api/collect 等）在页面加载
 * 时就会发 POST，直接等「任意 POST」会被它抢先匹配，导致测试提前 reload、
 * 把真正的 server action 请求取消掉（曾让置顶/审核类用例随机失败）。
 */
export function isActionPostResponse(response: Response): boolean {
  const request = response.request();
  if (request.method() !== "POST") return false;
  const url = request.url();
  return !url.includes("/api/collect");
}

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
