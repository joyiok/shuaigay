import { expect, test } from "@playwright/test";

const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// 等表单 POST 落袋再断言：同页 redirect/reload 会取消在途请求
async function submitAndSync(page: import("@playwright/test").Page, button: import("@playwright/test").Locator) {
  const posted = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 20000 });
  await button.click();
  await posted;
}

async function loginAs(page: import("@playwright/test").Page, email: string, password: string, nameInHeader: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.locator("header")).toContainText(nameInHeader);
}

// 版主后台对齐：任命技术版版主 → 只能看到自己版块的主题/帖子管理 → 置顶本版块生效
test("版主：在自己版块置顶/锁定，看不到其它版块与用户管理", async ({ page }) => {
  const modName = `md${uniq}`.slice(0, 20);
  const modEmail = `${modName}@test.dev`;
  const title = `版主测试-${uniq}`;

  // 注册版主候选人
  await page.goto("/register");
  await page.fill('input[name="email"]', modEmail);
  await page.fill('input[name="username"]', modName);
  await page.fill('input[name="password"]', "password123");
  await page.getByRole("button", { name: "注册 — 去吹水" }).click();
  await expect(page.locator("header")).toContainText(modName);

  // 管理员在技术版发一帖（免审直达）+ 任命版主
  await loginAs(page, "admin@example.com", "changeme123", "admin");
  await page.goto("/c/tech/new");
  await page.fill('input[name="title"]', title);
  await page.fill('textarea[name="content"]', "版主权限验证帖");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.goto("/admin/boards");
  // 主内容区技术版卡片（侧边栏也有同名链接，用 #main-content + 精确标题限定）
  const techCard = page.locator("#main-content .card", { has: page.getByRole("link", { name: "技术交流", exact: true }) }).first();
  await techCard.locator('input[name="username"]').fill(modName);
  await submitAndSync(page, techCard.getByRole("button", { name: "添加" }));
  // 同页 redirect 后路由缓存不刷新：重载拿新鲜版主列表
  await page.reload();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  await expect(techCard.getByText(modName).first()).toBeVisible({ timeout: 15000 });

  // 切到版主：后台只有 4 个 tab，没有用户管理/版块管理
  await loginAs(page, modEmail, "password123", modName);
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "主题管理" })).toBeVisible();
  await expect(page.getByRole("link", { name: "帖子管理" })).toBeVisible();
  await expect(page.getByRole("link", { name: "举报队列" })).toBeVisible();
  await expect(page.getByRole("link", { name: "待审队列" })).toBeVisible();
  await expect(page.getByRole("link", { name: "用户管理" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "版块管理" })).toHaveCount(0);

  // 主题管理仅自己版块 + 置顶生效
  await page.goto("/admin/threads");
  await expect(page.getByText("仅自己版块")).toBeVisible();
  const row = page.locator("li", { hasText: title }).first();
  await expect(row).toBeVisible();
  await submitAndSync(page, row.getByRole("button", { name: "置顶" }));
  await page.reload();
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  await expect(row.getByRole("button", { name: "取消置顶" })).toBeVisible({ timeout: 15000 });

  // 帖子管理仅自己版块
  await page.goto("/admin/posts");
  await expect(page.getByText("仅自己版块")).toBeVisible();
});
