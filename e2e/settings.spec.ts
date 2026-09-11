import { expect, test, isActionPostResponse } from "./fixtures";

const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

/**
 * 等 Turnstile 测试 widget 把 token 写进隐藏 input。
 * 不等就点提交，偶发会带着空 token 发出、服务端返回 captcha_failed（本套用例的抖动来源）。
 */
async function waitTurnstile(page: import("@playwright/test").Page) {
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20000 });
}

async function registerAs(page: import("@playwright/test").Page, username: string) {
  await page.goto("/register");
  await page.fill('input[name="email"]', `${username}@test.dev`);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "ForumTest123!");
  await waitTurnstile(page);
  const posted = page.waitForResponse(isActionPostResponse, { timeout: 20000 });
  await page.getByRole("button", { name: "注册 — 去吹水" }).click();
  await posted;
  // 等注册跳转完成再断言，避免 SSR 还没到就检查 header
  await expect.poll(() => page.url(), { timeout: 30000 }).not.toContain("/register");
  await expect(page.locator("header")).toContainText(username, { timeout: 30000 });
}

async function loginAs(page: import("@playwright/test").Page, email: string, password: string, nameInHeader: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await waitTurnstile(page);
  const posted = page.waitForResponse(isActionPostResponse, { timeout: 20000 });
  await page.getByRole("button", { name: "登录 →" }).click();
  await posted;
  await expect.poll(() => page.url(), { timeout: 30000 }).not.toContain("/login");
  await expect(page.locator("header")).toContainText(nameInHeader, { timeout: 30000 });
}

/**
 * 设置页表单提交：SettingsForm 提交成功后整页跳转 /settings?ok=...，
 * 等跳转落地并确认正文已渲染（回归：曾因 action 内同路径 redirect 变空白）。
 */
async function submitSettings(page: import("@playwright/test").Page, button: import("@playwright/test").Locator) {
  const posted = page.waitForResponse(isActionPostResponse, { timeout: 20000 });
  await button.click();
  await posted;
  await page.waitForURL(/ok=/, { timeout: 30000 });
  await expect(page.getByRole("heading", { name: "账号设置" })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('input[name="follow"]')).toBeVisible({ timeout: 20000 });
}

/** 关注/取关：等 POST 落库再 reload，按钮态才是服务端真值 */
async function toggleFollow(page: import("@playwright/test").Page, name: string, expected: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeVisible({ timeout: 20000 });
  const posted = page.waitForResponse(isActionPostResponse, { timeout: 20000 });
  await button.click();
  await posted;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await expect(page.getByRole("button", { name: expected, exact: true })).toBeVisible({ timeout: 20000 });
}

test("账号设置页:入口可达、简介可存、通知偏好可关可开", async ({ page }) => {
  const username = `st${uniq}`.slice(0, 20);
  await registerAs(page, username);

  // 顶栏「设置」入口（aria-label=账号设置；抽屉里的同名入口在未打开的 dialog 内，不可见）
  await page.locator('header a[href="/settings"]').click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole("heading", { name: "账号设置" })).toBeVisible();
  await expect(page.getByText(`${username}@test.dev`)).toBeVisible();

  // 简介保存后自动跳个人主页并同步展示
  await page.fill('textarea[name="bio"]', "设置页写的一句话简介");
  await page.getByRole("button", { name: "保存简介" }).click();
  await page.waitForURL(new RegExp(`/u/${username}`), { timeout: 30000 });
  await expect(page.getByText("设置页写的一句话简介")).toBeVisible({ timeout: 20000 });

  // 通知偏好:取消勾选后保存,刷新后仍是未勾选
  await page.goto("/settings");
  const followBox = page.locator('input[name="follow"]');
  await expect(followBox).toBeChecked();
  await followBox.uncheck();
  await submitSettings(page, page.getByRole("button", { name: "保存通知偏好" }));
  await expect(page.locator('input[name="follow"]')).not.toBeChecked();

  // 再打开并保存,恢复默认
  await page.locator('input[name="follow"]').check();
  await submitSettings(page, page.getByRole("button", { name: "保存通知偏好" }));
  await expect(page.locator('input[name="follow"]')).toBeChecked();
});

test("通知偏好生效:关掉社交提醒后,新关注不再产生通知", async ({ page }) => {
  const userA = `ga${uniq}`.slice(0, 20);
  const userB = `gb${uniq}`.slice(0, 20);
  await registerAs(page, userA);
  await registerAs(page, userB);

  // B 关闭「社交提醒」
  await loginAs(page, `${userB}@test.dev`, "ForumTest123!", userB);
  await page.goto("/settings");
  await page.locator('input[name="follow"]').uncheck();
  await submitSettings(page, page.getByRole("button", { name: "保存通知偏好" }));
  await expect(page.locator('input[name="follow"]')).not.toBeChecked();

  // A 关注 B：B 不应收到关注通知
  await loginAs(page, `${userA}@test.dev`, "ForumTest123!", userA);
  await page.goto(`/u/${userB}`);
  await toggleFollow(page, "+ 关注", "✓ 已关注");

  await loginAs(page, `${userB}@test.dev`, "ForumTest123!", userB);
  await page.goto("/notifications");
  await expect(page.getByText("还没有通知")).toBeVisible({ timeout: 15000 });

  // B 重新打开社交提醒后，取消关注再关注会产生通知
  await page.goto("/settings");
  await page.locator('input[name="follow"]').check();
  await submitSettings(page, page.getByRole("button", { name: "保存通知偏好" }));

  await loginAs(page, `${userA}@test.dev`, "ForumTest123!", userA);
  await page.goto(`/u/${userB}`);
  await toggleFollow(page, "✓ 已关注", "+ 关注");
  await toggleFollow(page, "+ 关注", "✓ 已关注");

  await loginAs(page, `${userB}@test.dev`, "ForumTest123!", userB);
  await page.goto("/notifications");
  await expect(page.getByText(`${userA} 关注了你`).first()).toBeVisible({ timeout: 15000 });
});

test("关注/粉丝列表页:两个 Tab 都能打开且互相跳转", async ({ page }) => {
  const userA = `la${uniq}`.slice(0, 20);
  const userB = `lb${uniq}`.slice(0, 20);
  await registerAs(page, userA);
  await registerAs(page, userB);

  // A 关注 B
  await loginAs(page, `${userA}@test.dev`, "ForumTest123!", userA);
  await page.goto(`/u/${userB}`);
  await toggleFollow(page, "+ 关注", "✓ 已关注");

  // B 的粉丝列表里能看到 A
  await page.goto(`/u/${userB}/followers`);
  await expect(page.getByRole("heading", { name: `${userB} 的社交圈` })).toBeVisible();
  await expect(page.getByRole("link", { name: userA, exact: true })).toBeVisible({ timeout: 15000 });

  // A 的关注列表里能看到 B
  await page.goto(`/u/${userA}/followers?tab=following`);
  await expect(page.getByRole("link", { name: userB, exact: true })).toBeVisible({ timeout: 15000 });

  // 主页的粉丝/关注数字可点进列表页
  await page.goto(`/u/${userB}`);
  await page.getByRole("link", { name: /粉丝\s*1/ }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${userB}/followers`));
});
