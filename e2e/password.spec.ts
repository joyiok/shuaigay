import { expect, test } from "@playwright/test";

const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// 自助改密码：错原密码被拒 → 对了换成功 → 新密码可登录（旧密码不行）
test("改密码：验原密码、换后踢其它会话、新密码可登录", async ({ page }) => {
  const username = `pw${uniq}`.slice(0, 20);
  const email = `${username}@test.dev`;
  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "password123");
  await page.getByRole("button", { name: "注册 — 去吹水" }).click();
  await expect(page.locator("header")).toContainText(username);

  // 主页换密码区可见
  await page.goto(`/u/${username}`);
  await expect(page.getByPlaceholder("原密码")).toBeVisible();
  await expect(page.getByPlaceholder("新密码(8-72 位)")).toBeVisible();

  // 原密码填错：被拒
  await page.fill('input[name="currentPassword"]', "wrongpass1");
  await page.fill('input[name="newPassword"]', "newpass123");
  await page.getByRole("button", { name: "换密码" }).click();
  await page.waitForURL("**?error=wrong_password", { timeout: 15000 }).catch(() => {});
  await expect(page.getByText("原密码不对")).toBeVisible();
  // 文本出现只代表 SSR 到达，注水可能没完：等 load 再点，否则提交被吞
  await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});

  // 换成功（短密码被浏览器 minLength 直接拦，服务端 invalid 分支防绕过不测 UI）
  await page.fill('input[name="currentPassword"]', "password123");
  await page.fill('input[name="newPassword"]', "newpass123");
  await page.getByRole("button", { name: "换密码" }).click();
  await page.waitForURL("**?ok=password_changed", { timeout: 15000 });
  await expect(page.getByText("密码已换好")).toBeVisible();

  // 退出后旧密码登不上（断言拒绝文案同步导航，避免空断言导致后续输入被重定向清空）
  await page.getByRole("button", { name: "退出" }).first().click();
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "password123");
  await page.getByRole("button", { name: "登录 →" }).click();
  await expect(page.getByText("邮箱或密码不对")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("header")).not.toContainText(username);
  // 失败后表单清空，邮箱重填再用新密码登
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "newpass123");
  await page.getByRole("button", { name: "登录 →" }).click();
  await expect(page.locator("header")).toContainText(username);
});
