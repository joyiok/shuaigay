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

export const test = base;
export { expect };
