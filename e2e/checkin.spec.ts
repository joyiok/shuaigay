import { test, expect } from "./fixtures";

for (const mobile of [false, true]) {
  test(`签到：${mobile ? "手机与减少动态效果" : "桌面动效"}、失败重试、原地到账与刷新`, async ({ page }, testInfo) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: mobile ? "reduce" : "no-preference" });
    const username = `ck${Date.now()}${mobile ? "m" : "d"}`;
    await page.goto("/register");
    await page.fill('[name="email"]', `${username}@test.dev`);
    await page.fill('[name="username"]', username);
    await page.fill('[name="password"]', "ForumTest123!");
    await expect(page.locator('input[name="captcha-answer"]')).toHaveValue(/^\d{5}$/, { timeout: 20000 });
    await page.getByRole("button", { name: /注册/ }).click();
    await expect(page.locator("header")).toContainText(username);
    await page.goto("/c/general");
    if (mobile) await page.getByRole("button", { name: "打开菜单" }).click();
    const card = page.locator(mobile ? "dialog .checkin-card" : ".sidebar .checkin-card");
    const button = card.getByRole("button");
    await expect(button).toBeEnabled();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath("before.png") });

    // 暂停这一次 action，验证等待态和防重复提交，再模拟断网。
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/c/general", async (route) => {
      if (!route.request().headers()["next-action"]) return route.continue();
      await gate;
      await route.abort("failed");
    });
    await button.click();
    try {
      await expect(button).toBeDisabled();
      await expect(button).toHaveText("正在签到…");
    } finally {
      release();
    }
    await expect(card.getByRole("status")).toContainText("请检查网络后重试");
    await expect(button).toBeEnabled();
    await expect(card.locator('[data-today="true"]')).toHaveAttribute("data-hit", "false");
    await page.unroute("**/c/general");

    await card.evaluate((element) => {
      element.addEventListener("animationstart", (event) => {
        element.setAttribute("data-animations", `${element.getAttribute("data-animations") ?? ""} ${(event as AnimationEvent).animationName}`);
      });
    });
    const url = page.url();
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveText("今天已签到", { timeout: 15_000 });
    await expect(button).toBeDisabled();
    await expect(card.getByRole("status")).toHaveText(/\+\d+ 积分已到账/);
    await expect(card.locator('[data-today="true"]')).toHaveAttribute("data-hit", "true");
    await expect(card.locator(".checkin-streak")).toHaveText("连续签到 1 天");
    await expect(page).toHaveURL(url);
    if (mobile) {
      expect(await card.locator(".checkin-stamp").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    } else {
      await expect(card).toHaveAttribute("data-animations", /checkin-tick/);
    }
    await page.screenshot({ path: testInfo.outputPath("success.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (mobile) {
      await page.getByRole("button", { name: "关闭菜单" }).click();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect(page.locator(".sidebar .checkin-button")).toHaveText("今天已签到");
    }
    await page.reload();
    await expect(page.locator(".sidebar .checkin-button")).toHaveText("今天已签到");
    await expect(page.locator(".sidebar .checkin-reward")).toHaveCount(0);
    await expect(page.locator(".sidebar .checkin-heading")).toContainText("本月 1 天");
  });
}
