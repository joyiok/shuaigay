import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// 本地跑 e2e 时 .env 不会被 playwright 自动加载，这里补一次（CI 里已有环境变量）
try {
  process.loadEnvFile();
} catch {
  /* .env 不存在时用进程环境变量 */
}

const uniq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function loginAs(page: import("@playwright/test").Page, email: string, password: string, nameInHeader: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20000 });
  const posted = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 20000 });
  await page.getByRole("button", { name: "登录 →" }).click();
  await posted;
  await expect(page.locator("header")).toContainText(nameInHeader, { timeout: 30000 });
}

test("小说阅读：章节目录、上一章/下一章、追更按钮", async ({ page }) => {
  const authorName = `nw${uniq}`.slice(0, 20);
  const readerName = `nr${uniq}`.slice(0, 20);
  const db = new PrismaClient();
  let threadId = "";
  const userIds: string[] = [];
  try {
    const passwordHash = await bcrypt.hash("ForumTest123!", 4);
    const author = await db.user.create({ data: { email: `${authorName}@test.dev`, username: authorName, passwordHash } });
    const reader = await db.user.create({ data: { email: `${readerName}@test.dev`, username: readerName, passwordHash } });
    userIds.push(author.id, reader.id);
    const board = await db.board.findUniqueOrThrow({ where: { slug: "novel" } });
    const thread = await db.thread.create({
      data: { boardId: board.id, authorId: author.id, title: `雨夜测试-${uniq}`, status: "approved" },
    });
    threadId = thread.id;
    for (const md of ["# 第一章 雨夜\n\n雨下了一整夜。", "## 第二章 相遇\n\n她在便利店门口停下。", "第三章 告白\n\n他终于说出口。"]) {
      await db.post.create({ data: { threadId: thread.id, authorId: author.id, contentMd: md, status: "approved" } });
    }
  } finally {
    await db.$disconnect();
  }

  try {
    await loginAs(page, `${readerName}@test.dev`, "ForumTest123!", readerName);
    await page.goto(`/t/${threadId}`);

    // 阅读器工具条：目录 + 底部导航
    await expect(page.locator(".novel-toc")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".novel-chapter-nav")).toBeVisible();
    await page.getByRole("button", { name: "展开目录" }).click();
    await expect(page.locator(".novel-toc-link")).toHaveCount(3);
    await expect(page.locator(".novel-toc-link").first()).toContainText("第一章 雨夜");
    await expect(page.locator(".novel-toc-link").nth(1)).toContainText("第二章 相遇");

    // 当前章高亮 + 下一章跳转
    await expect(page.locator(".novel-chapter-nav")).toContainText("第 1 章");
    await page.getByRole("button", { name: /下一章/ }).click();
    await expect(page.locator(".novel-chapter-nav")).toContainText("第 2 章", { timeout: 15000 });

    // 目录点击跳转回第一章
    await page.locator(".novel-toc-link").first().click();
    await expect(page.locator(".novel-chapter-nav")).toContainText("第 1 章", { timeout: 15000 });

    // 追更（收藏）按钮：点击后即时变「追更中」
    const followBtn = page.getByRole("button", { name: "☆ 追更" });
    await expect(followBtn).toBeVisible();
    await followBtn.click();
    await expect(page.getByRole("button", { name: "★ 追更中" })).toBeVisible({ timeout: 20000 });
  } finally {
    // 清理：删主题（级联帖子/收藏）与两个测试用户
    const cleanup = new PrismaClient();
    try {
      if (threadId) await cleanup.thread.deleteMany({ where: { id: threadId } });
      if (userIds.length) await cleanup.user.deleteMany({ where: { id: { in: userIds } } });
    } catch {
      /* 清理失败不影响断言结果 */
    } finally {
      await cleanup.$disconnect();
    }
  }
});
