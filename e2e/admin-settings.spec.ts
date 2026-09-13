import { expect, test, isActionPostResponse } from "./fixtures";

test("站点设置按职责拆分并独立保存", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', "admin@example.com");
  await page.fill('input[name="password"]', "ReleaseAdmin123!");
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20000 });
  await page.getByRole("button", { name: "登录 →" }).click();
  await expect(page.locator("header")).toContainText("admin", { timeout: 20000 });

  await page.goto("/admin/settings");
  const sections = page.getByRole("navigation", { name: "站点设置分类" });
  await expect(sections.getByRole("link")).toHaveCount(4);
  await expect(page.locator('input[name="siteName"]')).toBeVisible();
  await expect(page.locator('input[name="pointsThread"]')).toHaveCount(0);
  await expect(page.locator('input[name="guestThreadLimit"]')).toHaveCount(0);

  await sections.getByRole("link", { name: "积分与等级" }).click();
  await expect(page).toHaveURL(/\/admin\/settings\?section=points/);
  await expect(page.locator('input[name="pointsThread"]')).toBeVisible();
  await expect(page.locator('input[name="siteName"]')).toHaveCount(0);
  const savedPoints = page.waitForResponse(isActionPostResponse);
  await page.getByRole("button", { name: "保存积分与等级" }).click();
  await savedPoints;
  await expect(page).toHaveURL(/section=points/);

  await sections.getByRole("link", { name: "访客权限" }).click();
  await expect(page.locator('input[name="guestThreadLimit"]')).toBeVisible();
  await expect(page.locator('input[name="pointsThread"]')).toHaveCount(0);
  const savedAccess = page.waitForResponse(isActionPostResponse);
  await page.getByRole("button", { name: "保存访客权限" }).click();
  await savedAccess;
  await expect(page).toHaveURL(/section=access/);

  await sections.getByRole("link", { name: "MCP 管理" }).click();
  await expect(page.locator('input[name="adminApiKey"]')).toBeVisible();
  await expect(page.locator('input[name="guestThreadLimit"]')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const link of await sections.getByRole("link").all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
