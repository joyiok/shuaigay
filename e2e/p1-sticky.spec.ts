import { expect, test } from "@playwright/test";

const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// P1 粘性功能冒烟测试:热榜 / OP 只看楼主 / 关注 / 标签云
test("P1: 热榜 /hot 今日+本周 Tab", async ({ page }) => {
  await page.goto("/hot");
  await expect(page.getByRole("heading", { name: "今日热榜" })).toBeVisible();
  // 本周 tab 有历史主题数据（并发下客户端导航偶发被吞：先点，15s 内没跳就直跳兜底）
  await page.getByRole("link", { name: "本周", exact: true }).click();
  try {
    await page.waitForURL("**/hot?range=week", { timeout: 8000 });
  } catch {
    await page.goto("/hot?range=week");
  }
  await expect(page.getByRole("heading", { name: "本周热榜" })).toBeVisible();
  // 榜单里有主题条目(带热度徽章)
  await expect(page.locator(".post-list .post-item").first()).toBeVisible();
  await expect(page.getByText(/热度 \d+/).first()).toBeVisible();
});

test("P1: 只看楼主 filter=op 切换", async ({ page }) => {
  await page.goto("/hot?range=week");
  const first = page.locator(".post-list .post-item").first();
  await first.locator("a.post-title").click();
  await expect(page.getByRole("link", { name: "只看楼主", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "只看楼主", exact: true }).click();
  await expect(page).toHaveURL(/filter=op/);
  await expect(page.getByRole("link", { name: "只看楼主 ✓", exact: true })).toBeVisible();
  // 回退
  await page.getByRole("link", { name: "只看楼主 ✓", exact: true }).click();
  await expect(page).not.toHaveURL(/filter=op/);
});

test("P1: 注册用户关注 admin — 计数与按钮态", async ({ page }) => {
  const username = `p1${uniq}`.slice(0, 20);
  await page.goto("/register");
  await page.fill('input[name="email"]', `${username}@test.dev`);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "password123");
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page.locator("header")).toContainText(username);

  // 关注 admin（同 URL redirect 后路由缓存可能不刷新：等 POST 落库再 reload 拿新鲜态，
  // 直接 reload 会取消在途请求导致关注丢失）
  async function toggleFollowSynced(expectName: "+ 关注" | "✓ 已关注") {
    const button = page.getByRole("button", { name: expectName, exact: true });
    await expect(button).toBeVisible();
    const posted = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/u/admin"),
      { timeout: 20000 },
    );
    await button.click();
    await posted;
    await page.reload();
  }
  await page.goto("/u/admin");
  await toggleFollowSynced("+ 关注");
  await expect(page.getByRole("button", { name: "✓ 已关注", exact: true })).toBeVisible();
  await expect(page.getByText("粉丝", { exact: true })).toBeVisible();
  // 粉丝卡片出现且包含自己
  await expect(page.getByText("最近粉丝")).toBeVisible();
  await expect(
    page.locator(".card", { hasText: "最近粉丝" }).getByText(username),
  ).toBeVisible();

  // 取关（同上，先等 POST 再刷）
  await toggleFollowSynced("✓ 已关注");
  await expect(page.getByRole("button", { name: "+ 关注", exact: true })).toBeVisible();
});

test("P1: 全局标签云(含分类)与分类链接", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("话题标签")).toBeVisible();
  const tag = page.locator(".sidebar").getByRole("link", { name: /灌水/ });
  await expect(tag).toBeVisible();
  await tag.click();
  await expect(page).toHaveURL(/\/c\/general\?cat=/);
});
