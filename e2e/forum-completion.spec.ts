import { expect, test } from "./fixtures";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createHash, randomBytes } from "node:crypto";

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const password = "ForumTest123!";

async function makeUser(prefix: string) {
  const username = `${prefix}${suffix}`.slice(0, 20);
  return db.user.create({ data: { username, email: `${username}@test.dev`, passwordHash: await bcrypt.hash(password, 4) } });
}

async function login(page: import("@playwright/test").Page, email: string, username: string) {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86_400_000) } });
  await page.context().addCookies([{ name: "session", value: token, url: "http://localhost:3100" }]);
  await page.goto("/");
  await expect(page.locator("header")).toContainText(username, { timeout: 20_000 });
}

test("个人主页只公开已过审内容，并可翻页", async ({ page }) => {
  const user = await makeUser("pv");
  const visible = await db.board.create({ data: { slug: `visible-${suffix}`, name: "公开版" } });
  const hidden = await db.board.create({ data: { slug: `hidden-${suffix}`, name: "隐藏版", isHidden: true } });
  const rows = Array.from({ length: 31 }, (_, i) => ({ boardId: visible.id, authorId: user.id, title: `公开主题-${i}-${suffix}`, status: "approved" }));
  await db.thread.createMany({ data: rows });
  await db.thread.create({ data: { boardId: visible.id, authorId: user.id, title: `待审私密-${suffix}`, status: "pending", posts: { create: { authorId: user.id, contentMd: "待审正文", status: "pending" } } } });
  await db.thread.create({ data: { boardId: visible.id, authorId: user.id, title: `回收站私密-${suffix}`, status: "deleted", deletedAt: new Date(), posts: { create: { authorId: user.id, contentMd: "已删正文", status: "deleted" } } } });
  await db.thread.create({ data: { boardId: hidden.id, authorId: user.id, title: `隐藏版私密-${suffix}`, posts: { create: { authorId: user.id, contentMd: "隐藏正文" } } } });

  await page.goto(`/u/${user.username}`);
  await expect(page.getByText(`待审私密-${suffix}`)).toHaveCount(0);
  await expect(page.getByText(`回收站私密-${suffix}`)).toHaveCount(0);
  await expect(page.getByText(`隐藏版私密-${suffix}`)).toHaveCount(0);
  const nextPage = page.getByRole("navigation", { name: "个人内容分页" }).getByRole("link", { name: "下一页 →" });
  await expect(nextPage).toHaveAttribute("href", `/u/${user.username}?tab=topics&page=2`);
  await page.goto((await nextPage.getAttribute("href"))!);
  await expect(page.locator(".post-item")).toHaveCount(1);
});

test("私信支持历史翻页、删除、撤回和举报", async ({ page }) => {
  const sender = await makeUser("ms");
  const receiver = await makeUser("mr");
  await db.directMessage.createMany({
    data: Array.from({ length: 55 }, (_, i) => ({
      senderId: sender.id,
      receiverId: receiver.id,
      contentMd: `历史消息-${String(i).padStart(3, "0")}-${suffix}`,
      createdAt: new Date(Date.now() - (55 - i) * 1_000),
    })),
  });
  const reportedMessage = await db.directMessage.findFirstOrThrow({ where: { contentMd: `历史消息-000-${suffix}` } });
  await login(page, receiver.email, receiver.username);
  await page.goto(`/messages/${sender.username}`);
  await expect(page.getByText(`历史消息-054-${suffix}`)).toBeVisible();
  await expect(page.getByText(`历史消息-000-${suffix}`)).toHaveCount(0);
  const olderMessages = page.getByRole("link", { name: "← 更早消息" });
  await expect(olderMessages).toHaveAttribute("href", `/messages/${sender.username}?page=2`);
  await page.goto((await olderMessages.getAttribute("href"))!);
  await expect(page.getByText(`历史消息-000-${suffix}`)).toBeVisible();

  const reported = page.locator("li", { hasText: `历史消息-000-${suffix}` });
  await reported.getByRole("button", { name: "举报" }).click();
  await page.locator("dialog[open] textarea").fill("这是一条需要管理员检查的违规私信");
  await page.locator("dialog[open]").getByRole("button", { name: "提交举报" }).click();
  await expect(page.locator("dialog[open]")).toContainText("已提交");
  await page.locator("dialog[open]").getByRole("button", { name: "关闭" }).click();

  await reported.getByRole("button", { name: "删除" }).click();
  await page.getByRole("dialog", { name: "二次确认" }).getByRole("button", { name: "确认执行" }).click();
  await expect(page.getByText(`历史消息-000-${suffix}`)).toHaveCount(0);

  await login(page, "admin@example.com", "admin");
  await page.goto("/admin/reports");
  const reportRow = page.locator("li", { hasText: `历史消息-000-${suffix}` });
  await expect(reportRow).toBeVisible();
  await reportRow.getByRole("button", { name: "删除目标" }).click();
  await page.getByRole("dialog", { name: "二次确认" }).getByRole("button", { name: "确认执行" }).click();
  await expect.poll(async () => (await db.report.findFirst({ where: { targetType: "message", targetId: reportedMessage!.id }, select: { status: true } }))?.status, { timeout: 20_000 }).toBe("resolved");
  await expect(db.directMessage.findUnique({ where: { id: reportedMessage!.id } })).resolves.toBeNull();
  await page.reload();
  await expect(page.locator("li", { hasText: `历史消息-000-${suffix}` })).toHaveCount(0);

  await login(page, sender.email, sender.username);
  await page.goto(`/messages/${receiver.username}`);
  const latest = page.locator("li", { hasText: `历史消息-054-${suffix}` });
  await latest.getByRole("button", { name: "撤回" }).click();
  await page.getByRole("dialog", { name: "二次确认" }).getByRole("button", { name: "确认执行" }).click();
  await expect(page.getByText(`历史消息-054-${suffix}`)).toHaveCount(0);
});

test("数据可导出，账号可匿名注销", async ({ page }) => {
  const user = await makeUser("gd");
  await db.report.create({ data: { reporterId: user.id, targetType: "thread", targetId: `deleted-with-${suffix}`, reason: "注销时应删除的举报数据" } });
  await login(page, user.email, user.username);
  const liveUpdate = await page.evaluate(async () => {
    const controller = new AbortController();
    const response = await fetch("/api/notifications/stream", { signal: controller.signal });
    const { value } = await response.body!.getReader().read();
    controller.abort();
    return new TextDecoder().decode(value);
  });
  expect(liveUpdate).toContain('"unread"');
  const exported = await page.request.get("/api/account/export");
  expect(exported.ok()).toBeTruthy();
  expect(exported.headers()["content-disposition"]).toContain("attachment");
  expect((await exported.json()).account.username).toBe(user.username);

  await page.goto("/settings?section=privacy");
  await expect(page.getByRole("link", { name: "导出我的数据" })).toBeVisible();
  await page.fill('[name="confirmation"]', user.username);
  await page.fill('[name="password"]', password);
  await page.getByRole("button", { name: "永久注销账号" }).click();
  await page.getByRole("dialog", { name: "二次确认" }).getByRole("button", { name: "确认执行" }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1/);
  await expect(page.getByText("账号已注销")).toBeVisible();
  const deleted = await db.user.findUnique({ where: { id: user.id } });
  expect(deleted?.deletedAt).not.toBeNull();
  expect(deleted?.email).toContain("@deleted.invalid");
  expect(await db.report.count({ where: { reporterId: user.id } })).toBe(0);
});
