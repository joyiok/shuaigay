import { expect, test } from "@playwright/test";

const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test("通知闭环:注册→顶栏铃铛→通知中心空态→API未读数为0", async ({ page }) => {
  const username = `nt${uniq}`.slice(0, 20);
  await page.goto("/register");
  await page.fill('input[name="email"]', `${username}@test.dev`);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "password123");
  await page.getByRole("button", { name: "注册 — 去吹水" }).click();
  await expect(page.locator("header")).toContainText(username);

  // 顶栏铃铛出现
  await expect(page.getByRole("button", { name: "通知" })).toBeVisible();

  // 点开铃铛:空态 + 查看全部入口
  await page.getByRole("button", { name: "通知" }).click();
  await expect(page.getByText("暂无通知")).toBeVisible();
  await expect(page.getByRole("link", { name: "查看全部通知 →" })).toBeVisible();

  // 通知中心:tab 与空态
  await page.getByRole("link", { name: "查看全部通知 →" }).click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByRole("link", { name: "全部" })).toBeVisible();
  await expect(page.getByText("还没有通知")).toBeVisible();

  // API:已登录可读,未读数为 0
  const res = await page.request.get("/api/notifications?unread=1");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.unread).toBe(0);
});
