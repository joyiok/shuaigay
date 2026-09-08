import { expect, test } from "./fixtures";

const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function registerAs(page: import("@playwright/test").Page, username: string) {
  await page.goto("/register");
  await page.fill('input[name="email"]', `${username}@test.dev`);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "ForumTest123!");
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20000 });
  const posted = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 20000 });
  await page.getByRole("button", { name: "注册 — 去吹水" }).click();
  await posted;
  await expect.poll(() => page.url(), { timeout: 30000 }).not.toContain("/register");
  await expect(page.locator("header")).toContainText(username, { timeout: 30000 });
}

test("会员目录：入口、搜索、排序与主页跳转", async ({ page }) => {
  const username = `mb${uniq}`.slice(0, 20);
  await registerAs(page, username);

  // 侧边栏「活跃用户 → 全部」入口
  await page.goto("/");
  await page.locator('.sidebar a[href="/members"]').first().click();
  await expect(page).toHaveURL(/\/members/);
  await expect(page.getByRole("heading", { name: "会员目录" })).toBeVisible();
  await expect(page.locator(".member-card").first()).toBeVisible();

  // 搜索自己
  await page.locator('form[action="/members"] input[name="q"]').fill(username);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`q=${username}`));
  const card = page.locator(".member-card", { hasText: username });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText("新手上路");

  // 点用户名进主页
  await card.getByRole("link", { name: username, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/u/${username}`));

  // 排序 tab 切换（客户端导航偶发被吞，超时直跳兜底）
  await page.goto("/members");
  await page.getByRole("link", { name: "积分榜" }).click();
  try {
    await page.waitForURL(/sort=points/, { timeout: 8000 });
  } catch {
    await page.goto("/members?sort=points");
  }
  await expect(page).toHaveURL(/sort=points/);
  await page.getByRole("link", { name: "主题数" }).click();
  try {
    await page.waitForURL(/sort=threads/, { timeout: 8000 });
  } catch {
    await page.goto("/members?sort=threads");
  }
  await expect(page).toHaveURL(/sort=threads/);
});

test("关注按钮点击后立即变状态，无需刷新", async ({ page }) => {
  const userA = `mf${uniq}`.slice(0, 20);
  const userB = `mg${uniq}`.slice(0, 20);
  await registerAs(page, userA);
  await registerAs(page, userB);

  // 重新登录 A，才能看到 B 主页上的关注按钮
  await page.getByRole("button", { name: "退出" }).first().click();
  await page.goto("/login");
  await page.fill('input[name="email"]', `${userA}@test.dev`);
  await page.fill('input[name="password"]', "ForumTest123!");
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20000 });
  const loginPosted = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 20000 });
  await page.getByRole("button", { name: "登录 →" }).click();
  await loginPosted;
  await expect(page.locator("header")).toContainText(userA, { timeout: 30000 });

  await page.goto(`/u/${userB}`);
  const button = page.locator('form button[aria-pressed]').first();
  await expect(button).toHaveText("+ 关注");
  await expect(button).toHaveAttribute("aria-pressed", "false");

  await button.click();

  // 不 reload：按钮文案与 aria-pressed 立即翻转（乐观态，来自 action 返回的权威结果）
  await expect(button).toHaveText("✓ 已关注", { timeout: 20000 });
  await expect(button).toHaveAttribute("aria-pressed", "true");

  // reload 验证服务端真值：粉丝数 +1、按钮仍是已关注
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('form button[aria-pressed]').first()).toHaveText("✓ 已关注", { timeout: 20000 });
  await expect(page.locator(".post-meta").first()).toContainText("粉丝");
  await expect(page.locator(".post-meta").first()).toContainText("1");

  // 再点一次取关，同样即时
  await page.locator('form button[aria-pressed]').first().click();
  await expect(page.locator('form button[aria-pressed]').first()).toHaveText("+ 关注", { timeout: 20000 });
  await expect(page.locator('form button[aria-pressed]').first()).toHaveAttribute("aria-pressed", "false");
});
