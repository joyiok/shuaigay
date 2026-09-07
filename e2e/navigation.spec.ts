import { expect, test } from "@playwright/test";

test.use({ contextOptions: { reducedMotion: "reduce" } });

test("移动菜单限制焦点、支持关闭，并提供搜索入口", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "搜索", level: 1 })).toBeVisible();
  const trigger = page.getByRole("button", { name: "打开菜单" });
  const dialog = page.getByRole("dialog", { name: "导航菜单" });
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mobile-menu.png") });
  await expect(dialog.getByRole("button", { name: "关闭菜单" })).toBeFocused();
  // 模态框打开时，背景控件即使主动调用 focus 也不能夺走焦点。
  await trigger.evaluate((element) => element.focus());
  await expect(dialog.getByRole("button", { name: "关闭菜单" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("link", { name: "全部主题", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "关闭菜单" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

  await trigger.click();
  await page.locator(".mobile-drawer-backdrop").click({ position: { x: 350, y: 100 } });
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await dialog.getByRole("link", { name: "搜索主题与回复" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/search$/);

  await trigger.click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

for (const variant of ["header", "inline"]) {
  test(`${variant} 搜索支持键盘选择、空结果与请求失败`, async ({ page }, testInfo) => {
    await page.setViewportSize(variant === "header" ? { width: 1280, height: 900 } : { width: 390, height: 844 });
    await page.route("**/api/search/suggest?*", async (route) => {
      const q = new URL(route.request().url()).searchParams.get("q");
      await route.fulfill({
        status: q === "offline" ? 503 : 200,
        json: { suggestions: q === "match" ? [
          { id: "keyboard-first", title: "第一条搜索结果" },
          { id: "keyboard-second", title: "第二条搜索结果" },
        ] : [] },
      });
    });
    await page.goto("/search");
    await expect(page.locator("dialog.mobile-drawer")).toBeAttached();
    const wrap = page.locator(variant === "header" ? ".search-ac-wrap" : ".search-ac-wrap-inline");
    const input = wrap.getByRole("combobox");

    await input.fill("empty");
    await expect(wrap.getByRole("status")).toHaveText("无匹配主题，按回车搜索全文");
    await input.fill("offline");
    await expect(wrap.getByRole("status")).toHaveText("联想暂时不可用，按回车搜索");
    await input.fill("match");
    const options = wrap.getByRole("option");
    await expect(options).toHaveCount(2);
    await input.press("ArrowDown");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await input.press("ArrowUp");
    await expect(options.last()).toHaveAttribute("aria-selected", "true");
    await expect(input).toBeInViewport();
    expect(await input.evaluate((element) => element.closest("form")!.scrollTop)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`${variant}-search.png`) });
    await expect(input).toBeFocused();
    await input.press("Escape");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).toHaveValue("match");

    // 输入法确认键不应误跳转到当前候选主题。
    await input.press("ArrowDown");
    await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
    await expect(page).toHaveURL(/\/search$/);
    await input.press("Enter");
    await expect(page).toHaveURL(/\/t\/keyboard-first/);
  });
}
