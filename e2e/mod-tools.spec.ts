import { expect, test } from "./fixtures";

const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// 等表单 POST 落袋再断言：同页 redirect/reload 会取消在途请求
async function submitAndSync(page: import("@playwright/test").Page, button: import("@playwright/test").Locator) {
  const posted = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 20000 });
  const navigated = page.waitForEvent("framenavigated", {
    predicate: (frame) => frame === page.mainFrame(),
    timeout: 20000,
  });
  await button.click();
  await Promise.all([posted, navigated]);
}

async function loginAs(page: import("@playwright/test").Page, email: string, password: string, nameInHeader: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.locator("header")).toContainText(nameInHeader);
}

// 版主工具三件套：加精挂 badge → 全局置顶上首页 → 移动主题换版块
test("版主工具：加精/全局置顶/移动主题", async ({ page }) => {
  const title = `工具测试-${uniq}`;

  await loginAs(page, "admin@example.com", "ReleaseAdmin123!", "admin");
  await page.goto("/c/tech/new");
  await page.fill('input[name="title"]', title);
  await page.fill('textarea[name="content"]', "版主工具验证帖正文");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const threadUrl = page.url();

  // 加精：badge 出现
  await submitAndSync(page, page.getByRole("button", { name: "加精" }));
  await expect(page.getByText("精华").first()).toBeVisible({ timeout: 15000 });

  // 全局置顶：首页置顶区出现
  await submitAndSync(page, page.getByRole("button", { name: "全局置顶" }));
  await page.goto("/");
  const pinnedRow = page.locator(".post-item", { hasText: title }).first();
  await expect(pinnedRow).toBeVisible({ timeout: 15000 });
  await expect(pinnedRow.getByText("置顶", { exact: true })).toBeVisible();

  // 移动主题 tech → life：详情页版块变为生活分享
  await page.goto(threadUrl);
  await page.locator('select[name="targetBoardSlug"]').selectOption("life");
  await submitAndSync(page, page.getByRole("button", { name: "移动" }));
  await expect(page.locator(".breadcrumb")).toContainText("生活分享", { timeout: 15000 });
});
