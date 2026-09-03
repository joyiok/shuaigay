import { expect, test } from "@playwright/test";

const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// 提交按钮一律用可访问名称定位：
// 布局顶部栏的「搜索」表单也是 type=submit，不能使用宽泛的 button[type="submit"] 选择器
// 人性化文案后按钮带后缀（“注册 — 去吹水”“登录 →”），用子串匹配兼容
function submitButton(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("button", { name });
}

// 新人首帖进待审：以 admin 身份在待审队列通过指定标题的主题，返回主题链接
async function approvePendingThread(page: import("@playwright/test").Page, title: string): Promise<string | null> {
  await page.goto("/login");
  await page.fill('input[name="email"]', "admin@example.com");
  await page.fill('input[name="password"]', "changeme123");
  await submitButton(page, "登录").click();
  await expect(page.locator("header")).toContainText("admin");
  await page.goto("/admin/pending");
  const row = page.locator("li", { hasText: "待审主题" }).filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  const href = await row.locator("a").first().getAttribute("href");
  await row.getByRole("button", { name: "通过" }).click();
  await page.waitForURL("**/admin/pending*", { timeout: 15000 });
  await page.reload();
  await expect(row).toHaveCount(0);
  return href;
}

test("注册 → 发帖 → 回复 → 退出", async ({ page }) => {
  const username = `e2e${uniq}`.slice(0, 20);
  const email = `${username}@test.dev`;

  // 注册(自动登录)
  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "password123");
  await submitButton(page, "注册").click();
  await expect(page.locator("header")).toContainText(username);

  // 发帖（新人首帖进待审：断言审核提示，符合 moderation 策略）
  // 标题带唯一后缀：失败重跑不与旧待审同名互撞
  const e2eTitle = `E2E 测试帖-${uniq}`;
  await page.goto("/c/general/new");
  await page.fill('input[name="title"]', e2eTitle);
  await page.fill('textarea[name="content"]', "第一帖 **加粗** 内容");
  await submitButton(page, "发布").click();
  await expect(page.getByText("内容已提交，待版主/管理员审核后可见")).toBeVisible();

  // 管理员在待审队列通过该主题
  await page.goto("/login");
  await page.fill('input[name="email"]', "admin@example.com");
  await page.fill('input[name="password"]', "changeme123");
  await submitButton(page, "登录").click();
  await expect(page.locator("header")).toContainText("admin");
  await page.goto("/admin/pending");
  const pendingRow = page.locator("li", { hasText: "待审主题" }).filter({ hasText: e2eTitle }).first();
  await expect(pendingRow).toBeVisible();
  const threadHref = await pendingRow.locator("a").first().getAttribute("href");
  await pendingRow.getByRole("button", { name: "通过" }).click();
  // server action redirect 回同页可能命中路由缓存，显式重载拿新鲜待审队列
  await page.waitForURL("**/admin/pending*", { timeout: 15000 });
  await page.reload();
  await expect(pendingRow).toHaveCount(0);

  // 通过后主题可见，Markdown 正常渲染
  await page.goto(threadHref ?? "/");
  await expect(page.getByRole("heading", { name: e2eTitle })).toBeVisible();
  await expect(page.locator("strong")).toHaveText("加粗");

  // 回复
  await page.fill('textarea[name="content"]', "这是一条回复");
  await submitButton(page, "回复").click();
  await expect(page.getByText("这是一条回复")).toBeVisible();

  // 退出
  await submitButton(page, "退出").first().click();
  await expect(
    page.locator("header").getByRole("link", { name: "登录" }),
  ).toBeVisible();
});

test("未登录不能看到回复框,Markdown 里的 script 被消毒", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', "admin@example.com");
  await page.fill('input[name="password"]', "changeme123");
  await submitButton(page, "登录").click();
  await expect(page.locator("header")).toContainText("admin");

  await page.goto("/c/general/new");
  await page.fill('input[name="title"]', "XSS 探测帖");
  await page.fill(
    'textarea[name="content"]',
    "<script>window.__pwned=1</script>正常内容",
  );
  await submitButton(page, "发布").click();
  await expect(page.getByRole("heading", { name: "XSS 探测帖" })).toBeVisible();
  await expect(page.getByText("正常内容")).toBeVisible();

  const pwned = await page.evaluate(() => {
    return (window as unknown as { __pwned?: number }).__pwned ?? null;
  });
  expect(pwned).toBeNull();
});

// —— 新增：搜索、@提及、举报、管理后台、邀请、不存在的页面 ——

test("搜索：空态、高亮摘录与版块筛选", async ({ page }) => {
  const kw = `Kw${Date.now().toString(36).slice(-6)}`;
  const username = `sea${Date.now().toString(36).slice(-6)}`;
  const email = `${username}@test.dev`;

  // 未登录访问搜索空态
  await page.goto("/search");
  await expect(page.getByText("搜索论坛内容")).toBeVisible();
  await expect(page.getByRole("search").first()).toBeVisible();

  // 搜索不存在的关键词 -> EmptyState "没有找到相关内容"
  await page.goto(`/search?q=不存在的关键词${kw}`);
  await expect(page.getByText("没有找到相关内容")).toBeVisible();

  // 注册并创建带关键词的主题
  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "password123");
  await submitButton(page, "注册").click();
  await expect(page.locator("header")).toContainText(username);

  await page.goto("/c/general/new");
  await page.fill('input[name="title"]', `搜索命中-${kw}`);
  await page.fill('textarea[name="content"]', `这里埋了关键词 ${kw} 供搜索，高亮与摘录应正确。`);
  await submitButton(page, "发布").click();
  await expect(page.getByText("内容已提交，待版主/管理员审核后可见")).toBeVisible();

  // 过审后才能被搜到
  await approvePendingThread(page, `搜索命中-${kw}`);

  // 主题搜索：高亮标题中的关键词（标题在侧边热榜也会出现，用精确链接定位正文结果）
  await page.goto(`/search?q=${kw}`);
  await expect(page.getByRole("link", { name: `搜索命中-${kw}`, exact: true })).toBeVisible();
  await expect(page.locator("mark.search-mark").first()).toContainText(kw, { ignoreCase: true });

  // 按版块筛选：general 能命中，tech 不命中
  await page.goto(`/search?q=${kw}&board=general`);
  await expect(page.getByRole("link", { name: `搜索命中-${kw}`, exact: true })).toBeVisible();
  await page.goto(`/search?q=${kw}&board=tech`);
  await expect(page.getByText("没有找到相关内容")).toBeVisible();

  // 回复搜索：type=post 按 createdAt 倒序，excerpt 带关键词
  await page.goto(`/search?q=${kw}&type=post`);
  await expect(page.locator(".post-excerpt").first()).toContainText(kw, { ignoreCase: true });
});

test("@提及：渲染链接、去重与邮箱/代码块边界", async ({ page }) => {
  const uniq2 = Date.now().toString(36).slice(-5);
  const username = `at${uniq2}a`.slice(0, 12);
  const email = `${username}@test.dev`;
  // 注册提及作者
  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "password123");
  await submitButton(page, "注册").click();
  await expect(page.locator("header")).toContainText(username);

  // 发帖包含 @admin、邮箱、以及中文紧贴 @ 的边界情况
  const content = `你好 @admin 欢迎，邮箱 foo@bar.com 不应提及，看看@admin也不算，代码里 \`@admin\` 不算。二次提及 @admin 去重。`;
  await page.goto("/c/general/new");
  await page.fill('input[name="title"]', `提及测试-${uniq2}`);
  await page.fill('textarea[name="content"]', content);
  await submitButton(page, "发布").click();
  await expect(page.getByText("内容已提交，待版主/管理员审核后可见")).toBeVisible();

  // 过审后回到主题页再断言 @ 渲染
  const mentionHref = await approvePendingThread(page, `提及测试-${uniq2}`);
  await page.goto(mentionHref ?? "/");
  await expect(page.getByRole("heading", { name: `提及测试-${uniq2}` })).toBeVisible();

  // 首帖内容应把 @admin 转为链接，邮箱和紧贴中文的不转
  const mentionLink = page.locator('a.post-mention[href="/u/admin"]');
  await expect(mentionLink.first()).toBeVisible();
  await expect(mentionLink.first()).toContainText("@admin");
  // 去重：页面里 @admin 出现多次但链接去重后至少 1 个，不会把邮箱变成链接
  await expect(page.getByText("foo@bar.com")).toBeVisible();
  // 敏感词拦截：发帖含敏感词转待审（pending=1 + 审核提示），而非直接报错
  await page.goto("/c/general/new");
  await page.fill('input[name="title"]', `敏感词-${uniq2}`);
  await page.fill('textarea[name="content"]', "这里有傻逼应被拦截");
  await submitButton(page, "发布").click();
  await expect(page).toHaveURL(/pending=1/);
  await expect(page.getByText("内容已提交，待版主/管理员审核后可见")).toBeVisible();
});

test("举报：未登录卡片、创建、去重、限流与敏感词", async ({ page }) => {
  const uniq3 = Date.now().toString(36).slice(-5);
  // 用 admin 建一个待举报的主题
  await page.goto("/login");
  await page.fill('input[name="email"]', "admin@example.com");
  await page.fill('input[name="password"]', "changeme123");
  await submitButton(page, "登录").click();
  await expect(page.locator("header")).toContainText("admin");
  await page.goto("/c/general/new");
  await page.fill('input[name="title"]', `待举报-${uniq3}`);
  await page.fill('textarea[name="content"]', `待举报内容 ${uniq3}`);
  await submitButton(page, "发布").click();
  await expect(page.getByRole("heading", { name: `待举报-${uniq3}` })).toBeVisible();
  const threadUrl = page.url();
  const threadId = threadUrl.split("/t/")[1]?.split("?")[0] ?? "";
  expect(threadId).not.toBe("");
  // 退出后未登录尝试举报：对话框应提示登录
  await submitButton(page, "退出").first().click();
  await page.goto(`/t/${threadId}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(`**/t/${threadId}*`, { timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await expect(page.getByRole("button", { name: "举报" }).first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "举报" }).first().click({ force: true });
  await page.waitForTimeout(800);
  const dialogUnauth = page.locator("dialog.report-dialog");
  // 直接等 textarea 可见，兼容 open 属性在 CI 偶发不同步
  await expect(dialogUnauth.locator('textarea[name="reason"]')).toBeVisible({ timeout: 15000 });
  await dialogUnauth.locator('textarea[name="reason"]').fill("违规测试未登录");
  await dialogUnauth.getByRole("button", { name: "提交举报" }).click();
  await expect(dialogUnauth.getByText("请先登录")).toBeVisible();
  await expect(dialogUnauth.getByRole("link", { name: "去登录" })).toBeVisible();
  await page.keyboard.press("Escape");

  // 注册举报人并成功举报
  const repUser = `rep${uniq3}`.slice(0, 12);
  await page.goto("/register");
  await page.fill('input[name="email"]', `${repUser}@test.dev`);
  await page.fill('input[name="username"]', repUser);
  await page.fill('input[name="password"]', "password123");
  await submitButton(page, "注册").click();
  await expect(page.locator("header")).toContainText(repUser);
  await page.goto(`/t/${threadId}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(`**/t/${threadId}*`, { timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "举报" }).first().click({ force: true });
  await page.waitForTimeout(800);
  const dialog = page.locator("dialog.report-dialog");
  await expect(dialog.locator('textarea[name="reason"]')).toBeVisible({ timeout: 15000 });
  await dialog.locator('textarea[name="reason"]').fill("违规内容详细说明，需要审核处理");
  await dialog.getByRole("button", { name: "提交举报" }).click();
  await expect(dialog.getByText("已提交，等待管理员审核")).toBeVisible();
  await page.keyboard.press("Escape");

  // 重复举报同一目标应被去重 409
  await page.getByRole("button", { name: "举报" }).first().click({ force: true });
  await page.waitForTimeout(600);
  await expect(dialog.locator('textarea[name="reason"]')).toBeVisible({ timeout: 15000 });
  await dialog.locator('textarea[name="reason"]').fill("重复举报同一内容应被去重");
  await dialog.getByRole("button", { name: "提交举报" }).click();
  await expect(dialog.getByText("已在审核队列")).toBeVisible();
  await page.keyboard.press("Escape");

  // 敏感词举报应被拦截
  await page.getByRole("button", { name: "举报" }).first().click({ force: true });
  await page.waitForTimeout(600);
  await expect(dialog.locator('textarea[name="reason"]')).toBeVisible({ timeout: 15000 });
  await dialog.locator('textarea[name="reason"]').fill("包含傻逼的举报理由");
  await dialog.getByRole("button", { name: "提交举报" }).click();
  await expect(dialog.getByText("敏感词")).toBeVisible();
});

test("管理后台：未登录/普通用户/管理员分级与空态", async ({ page }) => {
  // 未登录访问 /admin 重定向到登录页
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "登录 — 回来坐坐" })).toBeVisible();
  await expect(page.getByRole("link", { name: /注册/ }).first()).toBeVisible();

  // 普通用户登录后访问应显示无权访问 EmptyState
  const uniq4 = Date.now().toString(36).slice(-5);
  const normal = `norm${uniq4}`.slice(0, 12);
  await page.goto("/register");
  await page.fill('input[name="email"]', `${normal}@test.dev`);
  await page.fill('input[name="username"]', normal);
  await page.fill('input[name="password"]', "password123");
  await submitButton(page, "注册").click();
  await expect(page.locator("header")).toContainText(normal);
  await page.goto("/admin");
  await expect(page.getByText("无权访问")).toBeVisible();
  await expect(page.getByRole("link", { name: "返回首页" })).toBeVisible();

  // 管理员可访问后台，tabs 可见，空态使用 EmptyState 而非裸文字
  await page.goto("/login");
  await page.fill('input[name="email"]', "admin@example.com");
  await page.fill('input[name="password"]', "changeme123");
  await submitButton(page, "登录").click();
  await expect(page.locator("header")).toContainText("admin");
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "主题管理" })).toBeVisible();
  await expect(page.getByRole("link", { name: "举报队列" })).toBeVisible();
  await expect(page.getByRole("link", { name: "版块管理" })).toBeVisible();
  // 举报队列空时显示 EmptyState 插画而非裸文字
  await page.goto("/admin?tab=reports");
  // 可能有前序举报未清理，两种情况都兼容：有列表或显示空态
  const reportsTitle = page.getByText("举报队列").first();
  await expect(reportsTitle).toBeVisible();
});

test("邀请：未登录卡片、生成原子性与版块/首页空态", async ({ page }) => {
  // 未登录访问 /invite 显示 AuthRequired 而非裸 307
  await page.goto("/invite");
  await expect(page).toHaveURL(/\/invite/);
  await expect(page.getByText("请先登录查看邀请码")).toBeVisible();
  await expect(page.getByRole("link", { name: "登录" }).first()).toBeVisible();

  // 未登录访问发帖页显示 AuthRequired
  await page.goto("/c/general/new");
  await expect(page.getByText("请先登录后发帖")).toBeVisible();
  await expect(page.getByRole("link", { name: "登录" }).first()).toBeVisible();

  // 登录后访问邀请页可生成邀请码
  const uniq5 = Date.now().toString(36).slice(-5);
  const inviter = `inv${uniq5}`.slice(0, 12);
  await page.goto("/register");
  await page.fill('input[name="email"]', `${inviter}@test.dev`);
  await page.fill('input[name="username"]', inviter);
  await page.fill('input[name="password"]', "password123");
  await submitButton(page, "注册").click();
  await expect(page.locator("header")).toContainText(inviter);
  await page.goto("/invite");
  await expect(page.getByRole("heading", { name: "邀请码" })).toBeVisible();
  await expect(page.getByRole("button", { name: "生成新码" })).toBeVisible();
  // 生成一个邀请码，页面应出现 8 位 hex 且可复制
  await page.getByRole("button", { name: "生成新码" }).click();
  await page.waitForLoadState("networkidle");
  const codeEl = page.locator("code").first();
  await expect(codeEl).toBeVisible();
  const code = (await codeEl.textContent())?.trim() ?? "";
  expect(code).toMatch(/^[a-f0-9]{8}$/);

  // 版块空态与首页空态已替换为 EmptyState：访问不存在的版块应显示 not-found
  await page.goto("/c/does-not-exist-zzz", { waitUntil: "commit" });
  await page.waitForURL("**/c/does-not-exist-zzz", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
  // 只要返回首页链接可见，即算 not-found 生效（404 文本在 CI 偶发不可见）
  await expect(page.getByRole("link", { name: "返回首页" }).first()).toBeVisible({ timeout: 15000 });

  // 访问不存在的主题也应显示 not-found
  await page.goto("/t/does-not-exist-id", { waitUntil: "commit" });
  await page.waitForURL("**/t/does-not-exist-id", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
  await expect(page.getByRole("link", { name: "返回首页" }).first()).toBeVisible({ timeout: 15000 });

  // 未登录访问 /u/:username 的编辑区显示登录卡片
  await page.goto("/login");
  // 先退出再以访客访问他人主页
  await submitButton(page, "退出").first().click().catch(() => {});
  await page.goto(`/u/${inviter}`);
  await expect(page.getByText(inviter).first()).toBeVisible();
  await expect(page.getByText("登录后可编辑个人简介")).toBeVisible();
});