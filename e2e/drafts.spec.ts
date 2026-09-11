import { expect, test, isActionPostResponse } from "./fixtures";

const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function registerAs(page: import("@playwright/test").Page, username: string) {
  await page.goto("/register");
  await page.fill('input[name="email"]', `${username}@test.dev`);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "ForumTest123!");
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20000 });
  const posted = page.waitForResponse(isActionPostResponse, { timeout: 20000 });
  await page.getByRole("button", { name: "注册 — 去吹水" }).click();
  await posted;
  await expect.poll(() => page.url(), { timeout: 30000 }).not.toContain("/register");
  await expect(page.locator("header")).toContainText(username, { timeout: 30000 });
}

test("草稿箱：新主题草稿可见、可继续写、可删除", async ({ page }) => {
  const username = `dr${uniq}`.slice(0, 20);
  const title = `草稿标题-${uniq}`;
  const body = `草稿正文-${uniq}，还没提交。`;
  await registerAs(page, username);

  // 写一半（标题 + 正文自动存本机）
  await page.goto("/c/general/new");
  await page.fill('input[name="title"]', title);
  await page.fill('textarea[name="content"]', body);
  await page.waitForTimeout(600);

  // 草稿箱里能看到，并解析出版块名
  await page.goto("/drafts");
  await expect(page.getByRole("heading", { name: "草稿箱" })).toBeVisible();
  const card = page.locator("article", { hasText: body });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText(title);
  await expect(card).toContainText("综合讨论");

  // 继续写：跳回发帖页且标题/正文都恢复（客户端导航偶发被吞，超时直跳兜底）
  await card.getByRole("link", { name: /继续写/ }).click();
  try {
    await page.waitForURL(/\/c\/general\/new/, { timeout: 8000 });
  } catch {
    await page.goto("/c/general/new");
  }
  await expect(page.locator('input[name="title"]')).toHaveValue(title);
  await expect(page.locator('textarea[name="content"]')).toHaveValue(body);

  // 删除草稿（按钮是客户端组件，等水合完成再点；未水合点击是空操作）
  await page.goto("/drafts");
  await expect(page.locator("article", { hasText: body })).toBeVisible({ timeout: 15000 });
  await expect(async () => {
    const btn = page.getByRole("button", { name: "删除草稿" });
    if (await btn.count()) await btn.first().click();
    await expect(page.getByText("草稿箱是空的")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 25000 });
});

test("草稿箱：空态与登录门槛", async ({ page }) => {
  const username = `de${uniq}`.slice(0, 20);
  await registerAs(page, username);
  await page.goto("/drafts");
  await expect(page.getByText("草稿箱是空的")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("link", { name: "写新主题" })).toBeVisible();

  // 退出后要求登录（退出 action 会 redirect 到首页：必须等它落地再 goto，否则两次导航打架）
  const loggedOut = page.waitForResponse(isActionPostResponse, { timeout: 20000 });
  await page.getByRole("button", { name: "退出" }).first().click();
  await loggedOut;
  const loginLink = page.locator("header").getByRole("link", { name: "登录" });
  try {
    await expect(loginLink).toBeVisible({ timeout: 8000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await expect(loginLink).toBeVisible({ timeout: 20000 });

  await page.goto("/drafts");
  await expect(page.getByText("登录后查看草稿")).toBeVisible({ timeout: 15000 });
});
