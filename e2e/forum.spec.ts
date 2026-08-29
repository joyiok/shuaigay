import { expect, test } from "@playwright/test";

const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test("注册 → 发帖 → 回复 → 退出", async ({ page }) => {
  const username = `e2e${uniq}`.slice(0, 20);
  const email = `${username}@test.dev`;

  // 注册(自动登录)
  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await expect(page.locator("header")).toContainText(username);

  // 发帖
  await page.goto("/c/general/new");
  await page.fill('input[name="title"]', "E2E 测试帖");
  await page.fill('textarea[name="content"]', "第一帖 **加粗** 内容");
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "E2E 测试帖" })).toBeVisible();
  await expect(page.locator("strong")).toHaveText("加粗");

  // 回复
  await page.fill('textarea[name="content"]', "这是一条回复");
  await page.click('button:has-text("回复")');
  await expect(page.getByText("这是一条回复")).toBeVisible();

  // 退出
  await page.click('button:has-text("退出")');
  await expect(
    page.locator("header").getByRole("link", { name: "登录" }),
  ).toBeVisible();
});

test("未登录不能看到回复框,Markdown 里的 script 被消毒", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', "admin@example.com");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button[type="submit"]');
  await expect(page.locator("header")).toContainText("admin");

  await page.goto("/c/general/new");
  await page.fill('input[name="title"]', "XSS 探测帖");
  await page.fill(
    'textarea[name="content"]',
    "<script>window.__pwned=1</script>正常内容",
  );
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: "XSS 探测帖" })).toBeVisible();
  await expect(page.getByText("正常内容")).toBeVisible();

  const pwned = await page.evaluate(() => {
    return (window as unknown as { __pwned?: number }).__pwned ?? null;
  });
  expect(pwned).toBeNull();
});
