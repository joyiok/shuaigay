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

async function registerAs(page: import("@playwright/test").Page, username: string) {
  await page.goto("/register");
  await page.fill('input[name="email"]', `${username}@test.dev`);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "password123");
  await page.getByRole("button", { name: "注册 — 去吹水" }).click();
  await expect(page.locator("header")).toContainText(username);
}

async function loginAs(page: import("@playwright/test").Page, email: string, password: string, nameInHeader: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.locator("header")).toContainText(nameInHeader);
}

async function submitAndSync(page: import("@playwright/test").Page, button: import("@playwright/test").Locator) {
  const posted = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 20000 });
  await button.click();
  await posted;
}

test("通知补齐:A 关注 B，B 收到关注通知；管理员发公告，B 收到系统通知", async ({ page }) => {
  const userA = `fa${uniq}`.slice(0, 20);
  const userB = `fb${uniq}`.slice(0, 20);
  const announce = `公告-${uniq}`;

  await registerAs(page, userA);
  await registerAs(page, userB);

  // A 关注 B
  await loginAs(page, `${userA}@test.dev`, "password123", userA);
  await page.goto(`/u/${userB}`);
  await submitAndSync(page, page.getByRole("button", { name: "+ 关注" }));
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  await expect(page.getByRole("button", { name: "已关注" })).toBeVisible({ timeout: 15000 });

  // B 的通知中心出现关注通知
  await loginAs(page, `${userB}@test.dev`, "password123", userB);
  await page.goto("/notifications");
  await expect(page.getByText(`${userA} 关注了你`).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("关注").first()).toBeVisible();

  // 管理员发全站公告
  await loginAs(page, "admin@example.com", "changeme123", "admin");
  await page.goto("/admin/stats");
  await page.fill('input[name="title"]', announce);
  await page.fill('input[name="body"]', "全站公告正文");
  await submitAndSync(page, page.getByRole("button", { name: "全站发送" }));
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });

  // B 收到系统公告
  await loginAs(page, `${userB}@test.dev`, "password123", userB);
  await page.goto("/notifications");
  await expect(page.getByText(announce).first()).toBeVisible({ timeout: 15000 });
});
