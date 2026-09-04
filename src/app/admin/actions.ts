"use server";

import { redirect } from "next/navigation";
import { revalidateTag, revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import {
  deletePost,
  deleteThread,
  reviewReport,
  settlePendingReports,
  type ReviewAction,
} from "@/lib/moderation";
import { getStorage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { banUser, unbanUser } from "@/lib/ban";
import { addSensitiveWord, removeSensitiveWord } from "@/lib/sensitive";
import { getModeratedBoardIds } from "@/lib/moderators";

const ADMIN_TAB = (tab: string) => `/admin/${tab}` as const;

/** 管理操作统一鉴权:非 ADMIN 一律回登录页 */
async function requireAdmin(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) redirect("/login");
  return user.id;
}

/** 版主/管理员通用鉴权:返回可操作的版块集合(null=管理员全量) */
async function requireStaff(): Promise<{ id: string; boardScope: Set<string> | null }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isAdmin(user)) return { id: user.id, boardScope: null };
  const boards = await getModeratedBoardIds(user.id);
  if (boards.size === 0) redirect("/login");
  return { id: user.id, boardScope: boards };
}

/* ---------------- 主题管理 ---------------- */

export async function adminTogglePinAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { pinned: true, boardId: true },
  });
  if (!thread) redirect(ADMIN_TAB("threads") + "&error=not_found");
  if (staff.boardScope && !staff.boardScope.has(thread.boardId)) redirect(ADMIN_TAB("threads") + "&error=forbidden");
  const actorId = staff.id;
  await db.thread.update({
    where: { id: threadId },
    data: { pinned: !thread.pinned },
  });
  await db.auditLog.create({ data: { actorId, action: "toggle_pin", targetType: "thread", targetId: threadId } }).catch(() => {});
  logger.info("admin.toggle_pin", { actorId, threadId, pinned: !thread.pinned });
  revalidateTag("threads");
  revalidatePath("/");
  redirect(ADMIN_TAB("threads"));
}

export async function adminToggleDigestAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { digested: true, boardId: true },
  });
  if (!thread) redirect(ADMIN_TAB("threads") + "&error=not_found");
  if (staff.boardScope && !staff.boardScope.has(thread.boardId)) redirect(ADMIN_TAB("threads") + "&error=forbidden");
  const actorId = staff.id;
  await db.thread.update({
    where: { id: threadId },
    data: { digested: !thread.digested },
  });
  await db.auditLog.create({ data: { actorId, action: "toggle_digest", targetType: "thread", targetId: threadId } }).catch(() => {});
  logger.info("admin.toggle_digest", { actorId, threadId, digested: !thread.digested });
  revalidateTag("threads");
  revalidatePath("/");
  redirect(ADMIN_TAB("threads"));
}

export async function adminToggleLockAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { locked: true, boardId: true },
  });
  if (!thread) redirect(ADMIN_TAB("threads") + "&error=not_found");
  if (staff.boardScope && !staff.boardScope.has(thread.boardId)) redirect(ADMIN_TAB("threads") + "&error=forbidden");
  const actorId = staff.id;
  await db.thread.update({
    where: { id: threadId },
    data: { locked: !thread.locked },
  });
  await db.auditLog.create({ data: { actorId, action: "toggle_lock", targetType: "thread", targetId: threadId } }).catch(() => {});
  logger.info("admin.toggle_lock", { actorId, threadId, locked: !thread.locked });
  revalidateTag("threads");
  redirect(ADMIN_TAB("threads"));
}

export async function adminDeleteThreadAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, boardId: true },
  });
  if (!thread) redirect(ADMIN_TAB("threads") + "&error=not_found");
  if (staff.boardScope && !staff.boardScope.has(thread.boardId)) redirect(ADMIN_TAB("threads") + "&error=forbidden");
  const actorId = staff.id;
  await deleteThread(threadId);
  await db.auditLog.create({ data: { actorId, action: "delete_thread", targetType: "thread", targetId: threadId } }).catch(() => {});
  logger.info("admin.delete_thread", { actorId, threadId });
  revalidateTag("stats");
  revalidateTag("threads");
  revalidateTag("boards");
  revalidatePath("/");
  redirect(ADMIN_TAB("threads"));
}

/* ---------------- 帖子管理 ---------------- */

export async function adminDeletePostAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const postId = String(formData.get("postId") ?? "");
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { id: true, thread: { select: { boardId: true } } },
  });
  if (!post) redirect(ADMIN_TAB("posts") + "&error=not_found");
  if (staff.boardScope && !staff.boardScope.has(post.thread.boardId)) redirect(ADMIN_TAB("posts") + "&error=forbidden");
  const actorId = staff.id;
  await deletePost(postId);
  await db.auditLog.create({ data: { actorId, action: "delete_post", targetType: "post", targetId: postId } }).catch(() => {});
  logger.info("admin.delete_post", { actorId, postId });
  revalidateTag("stats");
  revalidateTag("threads");
  revalidatePath("/");
  redirect(ADMIN_TAB("posts"));
}

/* ---------------- 用户管理 ---------------- */

const roleSchema = z.enum(["USER", "ADMIN"]);

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const admin = await getCurrentUser();
  if (!admin || !isAdmin(admin)) redirect("/login");
  if (admin.id === String(formData.get("userId") ?? "")) {
    redirect(ADMIN_TAB("users") + "&error=self_role");
  }

  const userId = String(formData.get("userId") ?? "");
  const role = roleSchema.safeParse(formData.get("role"));
  if (!role.success) redirect(ADMIN_TAB("users") + "&error=invalid");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) redirect(ADMIN_TAB("users") + "&error=not_found");

  await db.user.update({ where: { id: userId }, data: { role: role.data } });
  await db.auditLog.create({ data: { actorId: admin.id, action: "set_role", targetType: "user", targetId: userId, detail: role.data } }).catch(() => {});
  logger.info("admin.set_role", { actorId: admin.id, userId, role: role.data });
  revalidateTag("users");
  redirect(ADMIN_TAB("users"));
}

export async function addPointsAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const delta = z.coerce.number().int().min(-1000).max(1000).safeParse(formData.get("points"));
  if (!delta.success) redirect(ADMIN_TAB("users") + "&error=invalid");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) redirect(ADMIN_TAB("users") + "&error=not_found");

  await db.user.update({
    where: { id: userId },
    data: { points: { increment: delta.data } },
  });
  await db.auditLog.create({ data: { actorId, action: "add_points", targetType: "user", targetId: userId, detail: String(delta.data) } }).catch(() => {});
  logger.info("admin.add_points", { actorId, userId, delta: delta.data });
  revalidateTag("users");
  redirect(ADMIN_TAB("users"));
}

// 封禁 / 解封
export async function banUserAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || "违反社区规定";
  const duration = z.coerce.number().int().min(1).max(3650).safeParse(formData.get("durationDays"));
  const durationDays = duration.success ? duration.data : undefined;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) redirect(ADMIN_TAB("users") + "&error=not_found");
  if (userId === actorId) redirect(ADMIN_TAB("users") + "&error=self_ban");
  const hours = durationDays ? durationDays * 24 : null;
  await banUser(userId, reason, hours);
  await db.auditLog.create({ data: { actorId, action: "ban_user", targetType: "user", targetId: userId, detail: reason } }).catch(() => {});
  logger.info("admin.ban_user", { actorId, userId, reason, durationDays });
  revalidateTag("users");
  redirect(ADMIN_TAB("users"));
}

export async function unbanUserAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) redirect(ADMIN_TAB("users") + "&error=not_found");
  if (userId === actorId) redirect(ADMIN_TAB("users") + "&error=self_ban");
  await unbanUser(userId);
  await db.auditLog.create({ data: { actorId, action: "unban_user", targetType: "user", targetId: userId } }).catch(() => {});
  logger.info("admin.unban_user", { actorId, userId });
  revalidateTag("users");
  redirect(ADMIN_TAB("users"));
}

const updateUserSchema = z.object({
  userId: z.string().min(1),
  username: z.string().regex(/^[a-zA-Z0-9_-]{3,20}$/).optional(),
  email: z.string().email().max(200).optional(),
  bio: z.string().max(200).optional(),
});

export async function adminUpdateUserAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 200);
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) redirect(ADMIN_TAB("users") + "&error=not_found");
  const data: any = {};
  if (username) {
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) redirect(ADMIN_TAB("users") + "&error=invalid");
    const dup = await db.user.findFirst({ where: { username, id: { not: userId } }, select: { id: true } });
    if (dup) redirect(ADMIN_TAB("users") + "&error=username_taken");
    data.username = username;
  }
  if (email) {
    const parsed = z.string().email().safeParse(email);
    if (!parsed.success) redirect(ADMIN_TAB("users") + "&error=invalid");
    const dup = await db.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } });
    if (dup) redirect(ADMIN_TAB("users") + "&error=email_taken");
    data.email = email;
  }
  if (formData.has("bio")) data.bio = bio;
  if (Object.keys(data).length === 0) redirect(ADMIN_TAB("users") + "&error=invalid");
  await db.user.update({ where: { id: userId }, data });
  await db.auditLog.create({ data: { actorId, action: "update_user", targetType: "user", targetId: userId, detail: JSON.stringify(data).slice(0, 100) } }).catch(() => {});
  logger.info("admin.update_user", { actorId, userId, data });
  revalidateTag("users");
  redirect(ADMIN_TAB("users"));
}

export async function adminResetPasswordAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  const { isStrongPassword } = await import("@/lib/password");
  if (!isStrongPassword(password)) redirect(ADMIN_TAB("users") + "&error=invalid");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) redirect(ADMIN_TAB("users") + "&error=not_found");
  const { hashPassword } = await import("@/lib/auth");
  const passwordHash = await hashPassword(password);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });
  await db.session.deleteMany({ where: { userId } }).catch(() => {});
  await db.auditLog.create({ data: { actorId, action: "reset_password", targetType: "user", targetId: userId } }).catch(() => {});
  logger.info("admin.reset_password", { actorId, userId });
  revalidateTag("users");
  redirect(ADMIN_TAB("users"));
}

/* ---------------- 版块管理 ---------------- */

const boardSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{1,32}$/);
const boardNameSchema = z.string().trim().min(1).max(30);
const boardDescSchema = z.string().trim().max(200).optional();

export async function createBoardAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const slug = boardSlugSchema.safeParse(formData.get("slug"));
  const name = boardNameSchema.safeParse(formData.get("name"));
  const description = boardDescSchema.safeParse(formData.get("description") ?? "");
  const order = z.coerce.number().int().min(0).max(10_000).safeParse(formData.get("order") ?? "");
  if (!slug.success || !name.success || !description.success || !order.success) {
    redirect(ADMIN_TAB("boards") + "&error=invalid");
  }

  const existing = await db.board.findUnique({
    where: { slug: slug.data },
    select: { id: true },
  });
  if (existing) redirect(ADMIN_TAB("boards") + "&error=slug_taken");

  await db.board.create({
    data: {
      slug: slug.data,
      name: name.data,
      description: description.data || null,
      order: order.data,
    },
  });
  await db.auditLog.create({ data: { actorId, action: "create_board", targetType: "board", detail: slug.data } }).catch(() => {});
  logger.info("admin.create_board", { actorId, slug: slug.data });
  revalidateTag("boards");
  revalidatePath("/");
  redirect(ADMIN_TAB("boards"));
}

export async function deleteBoardAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const boardId = String(formData.get("boardId") ?? "");
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { id: true },
  });
  if (!board) redirect(ADMIN_TAB("boards") + "&error=not_found");

  const threads = await db.thread.findMany({
    where: { boardId },
    select: { id: true },
  });
  const threadIds = threads.map((t) => t.id);
  const atts = await db.attachment.findMany({
    where: threadIds.length ? { post: { threadId: { in: threadIds } } } : { postId: "none" },
    select: { storedName: true },
  });
  await db.board.delete({ where: { id: boardId } });
  await Promise.all(threadIds.map((id) => settlePendingReports("thread", id, false)));

  const storage = getStorage();
  await Promise.all(atts.map((a) => storage.remove(a.storedName)));
  await db.auditLog.create({ data: { actorId, action: "delete_board", targetType: "board", targetId: boardId } }).catch(() => {});
  logger.info("admin.delete_board", { actorId, boardId });
  revalidateTag("boards");
  revalidateTag("stats");
  revalidateTag("threads");
  revalidatePath("/");
  redirect(ADMIN_TAB("boards"));
}

/** 上移/下移:和相邻版块交换 order */
export async function moveBoardAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const boardId = String(formData.get("boardId") ?? "");
  const dir = String(formData.get("dir") ?? "");
  if (dir !== "up" && dir !== "down") redirect(ADMIN_TAB("boards") + "&error=invalid");

  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { id: true, order: true },
  });
  if (!board) redirect(ADMIN_TAB("boards") + "&error=not_found");

  const neighbor =
    dir === "up"
      ? await db.board.findFirst({
          where: { order: { lt: board.order } },
          orderBy: { order: "desc" },
          select: { id: true, order: true },
        })
      : await db.board.findFirst({
          where: { order: { gt: board.order } },
          orderBy: { order: "asc" },
          select: { id: true, order: true },
        });
  if (!neighbor) redirect(ADMIN_TAB("boards"));

  await db.$transaction([
    db.board.update({ where: { id: board.id }, data: { order: neighbor.order } }),
    db.board.update({ where: { id: neighbor.id }, data: { order: board.order } }),
  ]);
  await db.auditLog.create({ data: { actorId, action: "move_board", targetType: "board", targetId: boardId } }).catch(() => {});
  logger.info("admin.move_board", { actorId, boardId, dir });
  revalidateTag("boards");
  revalidatePath("/");
  redirect(ADMIN_TAB("boards"));
}

/* ---------------- 举报队列 ---------------- */

const reviewActionSchema = z.enum(["delete_thread", "delete_post", "ignore", "reject"]);

export async function reviewReportAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const reportId = String(formData.get("reportId") ?? "");
  const action = reviewActionSchema.safeParse(formData.get("action"));
  if (!action.success) redirect(ADMIN_TAB("reports") + "&error=invalid");

  // 版主只能处理自己版块内的举报
  if (staff.boardScope) {
    const report = await db.report.findUnique({
      where: { id: reportId },
      select: { targetType: true, targetId: true },
    });
    if (!report) redirect(ADMIN_TAB("reports") + "&error=not_found");
    let boardId: string | null = null;
    if (report.targetType === "thread") {
      const t = await db.thread.findUnique({ where: { id: report.targetId }, select: { boardId: true } });
      boardId = t?.boardId ?? null;
    } else {
      const p = await db.post.findUnique({
        where: { id: report.targetId },
        select: { thread: { select: { boardId: true } } },
      });
      boardId = p?.thread.boardId ?? null;
    }
    if (!boardId || !staff.boardScope.has(boardId)) redirect(ADMIN_TAB("reports") + "&error=not_found");
  }

  const result = await reviewReport(reportId, action.data as ReviewAction);
  if (!result.ok) {
    redirect(ADMIN_TAB("reports") + "&error=" + (result.status === 409 ? "already_processed" : "not_found"));
  }
  await db.auditLog.create({ data: { actorId: staff.id, action: "review_report", targetType: "report", targetId: reportId, detail: action.data } }).catch(() => {});
  logger.info("admin.review_report", { actorId: staff.id, reportId, action: action.data });
  redirect(ADMIN_TAB("reports"));
}

/* ---------------- 版主管理 ---------------- */

const usernameSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]{3,20}$/);

export async function addModeratorAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const boardId = String(formData.get("boardId") ?? "");
  const username = usernameSchema.safeParse(formData.get("username"));
  if (!username.success) redirect(ADMIN_TAB("boards") + "&error=invalid");
  const board = await db.board.findUnique({ where: { id: boardId }, select: { id: true, slug: true } });
  if (!board) redirect(ADMIN_TAB("boards") + "&error=not_found");
  const user = await db.user.findUnique({ where: { username: username.data }, select: { id: true } });
  if (!user) redirect(ADMIN_TAB("boards") + "&error=user_not_found");
  const dup = await db.boardModerator.findUnique({ where: { boardId_userId: { boardId, userId: user.id } } });
  if (dup) redirect(ADMIN_TAB("boards") + "&error=dup_moderator");
  await db.boardModerator.create({ data: { boardId, userId: user.id } });
  await db.auditLog.create({ data: { actorId, action: "set_moderator", targetType: "user", targetId: user.id, detail: board.slug } }).catch(() => {});
  logger.info("admin.set_moderator", { actorId, boardId, userId: user.id });
  revalidateTag("boards");
  redirect(ADMIN_TAB("boards"));
}

export async function removeModeratorAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const boardId = String(formData.get("boardId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const board = await db.board.findUnique({ where: { id: boardId }, select: { slug: true } });
  if (!board) redirect(ADMIN_TAB("boards") + "&error=not_found");
  const mod = await db.boardModerator.findUnique({ where: { boardId_userId: { boardId, userId } } });
  if (!mod) redirect(ADMIN_TAB("boards") + "&error=not_found");
  await db.boardModerator.delete({ where: { id: mod.id } });
  await db.auditLog.create({ data: { actorId, action: "remove_moderator", targetType: "user", targetId: userId, detail: board.slug } }).catch(() => {});
  logger.info("admin.remove_moderator", { actorId, boardId, userId });
  revalidateTag("boards");
  redirect(ADMIN_TAB("boards"));
}

/* ---------------- 主题分类 ---------------- */

const categoryNameSchema = z.string().trim().min(1).max(20);

export async function createCategoryAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const boardId = String(formData.get("boardId") ?? "");
  const name = categoryNameSchema.safeParse(formData.get("name"));
  if (!name.success) redirect(ADMIN_TAB("boards") + "&error=invalid");
  const board = await db.board.findUnique({ where: { id: boardId }, select: { id: true, slug: true } });
  if (!board) redirect(ADMIN_TAB("boards") + "&error=not_found");
  const dup = await db.threadCategory.findFirst({ where: { boardId, name: name.data } });
  if (dup) redirect(ADMIN_TAB("boards") + "&error=cat_exists");
  const count = await db.threadCategory.count({ where: { boardId } });
  await db.threadCategory.create({ data: { boardId, name: name.data, order: count } });
  await db.auditLog.create({ data: { actorId, action: "create_category", targetType: "board", targetId: boardId, detail: name.data } }).catch(() => {});
  logger.info("admin.create_category", { actorId, boardId, name: name.data });
  revalidateTag("boards");
  revalidateTag("threads");
  redirect(ADMIN_TAB("boards"));
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const categoryId = String(formData.get("categoryId") ?? "");
  const cat = await db.threadCategory.findUnique({ where: { id: categoryId }, select: { id: true, boardId: true, name: true } });
  if (!cat) redirect(ADMIN_TAB("boards") + "&error=not_found");
  await db.thread.updateMany({ where: { categoryId }, data: { categoryId: null } });
  await db.threadCategory.delete({ where: { id: categoryId } });
  await db.auditLog.create({ data: { actorId, action: "delete_category", targetType: "board", targetId: cat.boardId, detail: cat.name } }).catch(() => {});
  logger.info("admin.delete_category", { actorId, categoryId });
  revalidateTag("boards");
  revalidateTag("threads");
  redirect(ADMIN_TAB("boards"));
}

export async function renameCategoryAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const categoryId = String(formData.get("categoryId") ?? "");
  const name = categoryNameSchema.safeParse(formData.get("name"));
  if (!name.success) redirect(ADMIN_TAB("boards") + "&error=invalid");
  const cat = await db.threadCategory.findUnique({ where: { id: categoryId }, select: { id: true, boardId: true } });
  if (!cat) redirect(ADMIN_TAB("boards") + "&error=not_found");
  const dup = await db.threadCategory.findFirst({ where: { boardId: cat.boardId, name: name.data, id: { not: categoryId } } });
  if (dup) redirect(ADMIN_TAB("boards") + "&error=cat_exists");
  await db.threadCategory.update({ where: { id: categoryId }, data: { name: name.data } });
  await db.auditLog.create({ data: { actorId, action: "rename_category", targetType: "board", targetId: cat.boardId, detail: name.data } }).catch(() => {});
  logger.info("admin.rename_category", { actorId, categoryId, name: name.data });
  revalidateTag("boards");
  revalidateTag("threads");
  redirect(ADMIN_TAB("boards"));
}

export async function moveCategoryAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const categoryId = String(formData.get("categoryId") ?? "");
  const dir = String(formData.get("dir") ?? "");
  if (dir !== "up" && dir !== "down") redirect(ADMIN_TAB("boards") + "&error=invalid");
  const cat = await db.threadCategory.findUnique({ where: { id: categoryId }, select: { id: true, boardId: true, order: true } });
  if (!cat) redirect(ADMIN_TAB("boards") + "&error=not_found");
  const neighbor =
    dir === "up"
      ? await db.threadCategory.findFirst({ where: { boardId: cat.boardId, order: { lt: cat.order } }, orderBy: { order: "desc" }, select: { id: true, order: true } })
      : await db.threadCategory.findFirst({ where: { boardId: cat.boardId, order: { gt: cat.order } }, orderBy: { order: "asc" }, select: { id: true, order: true } });
  if (!neighbor) redirect(ADMIN_TAB("boards"));
  await db.$transaction([
    db.threadCategory.update({ where: { id: cat.id }, data: { order: neighbor.order } }),
    db.threadCategory.update({ where: { id: neighbor.id }, data: { order: cat.order } }),
  ]);
  await db.auditLog.create({ data: { actorId, action: "move_category", targetType: "board", targetId: cat.boardId } }).catch(() => {});
  logger.info("admin.move_category", { actorId, categoryId, dir });
  revalidateTag("boards");
  redirect(ADMIN_TAB("boards"));
}

export async function updateBoardAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const boardId = String(formData.get("boardId") ?? "");
  const slug = boardSlugSchema.safeParse(formData.get("slug"));
  const name = boardNameSchema.safeParse(formData.get("name"));
  const description = boardDescSchema.safeParse(formData.get("description") ?? "");
  if (!slug.success || !name.success || !description.success) redirect(ADMIN_TAB("boards") + "&error=invalid");
  const board = await db.board.findUnique({ where: { id: boardId }, select: { id: true } });
  if (!board) redirect(ADMIN_TAB("boards") + "&error=not_found");
  const dup = await db.board.findFirst({ where: { slug: slug.data, id: { not: boardId } }, select: { id: true } });
  if (dup) redirect(ADMIN_TAB("boards") + "&error=slug_taken");
  await db.board.update({ where: { id: boardId }, data: { slug: slug.data, name: name.data, description: description.data || null } });
  await db.auditLog.create({ data: { actorId, action: "update_board", targetType: "board", targetId: boardId, detail: slug.data } }).catch(() => {});
  logger.info("admin.update_board", { actorId, boardId, slug: slug.data });
  revalidateTag("boards");
  revalidatePath("/");
  redirect(ADMIN_TAB("boards"));
}

export async function toggleBoardHiddenAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const boardId = String(formData.get("boardId") ?? "");
  const board = await db.board.findUnique({ where: { id: boardId }, select: { isHidden: true } });
  if (!board) redirect(ADMIN_TAB("boards") + "&error=not_found");
  await db.board.update({ where: { id: boardId }, data: { isHidden: !board.isHidden } });
  await db.auditLog.create({ data: { actorId, action: "toggle_hidden", targetType: "board", targetId: boardId, detail: String(!board.isHidden) } }).catch(() => {});
  logger.info("admin.toggle_hidden", { actorId, boardId, hidden: !board.isHidden });
  revalidateTag("boards");
  revalidatePath("/");
  redirect(ADMIN_TAB("boards"));
}

export async function toggleBoardLockedAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const boardId = String(formData.get("boardId") ?? "");
  const board = await db.board.findUnique({ where: { id: boardId }, select: { isLocked: true } });
  if (!board) redirect(ADMIN_TAB("boards") + "&error=not_found");
  await db.board.update({ where: { id: boardId }, data: { isLocked: !board.isLocked } });
  await db.auditLog.create({ data: { actorId, action: "toggle_locked", targetType: "board", targetId: boardId, detail: String(!board.isLocked) } }).catch(() => {});
  logger.info("admin.toggle_locked", { actorId, boardId, locked: !board.isLocked });
  revalidateTag("boards");
  redirect(ADMIN_TAB("boards"));
}

export async function toggleBoardApprovalAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const boardId = String(formData.get("boardId") ?? "");
  const board = await db.board.findUnique({ where: { id: boardId }, select: { requireApproval: true } });
  if (!board) redirect(ADMIN_TAB("boards") + "&error=not_found");
  await db.board.update({ where: { id: boardId }, data: { requireApproval: !board.requireApproval } });
  await db.auditLog.create({ data: { actorId, action: "toggle_approval", targetType: "board", targetId: boardId, detail: String(!board.requireApproval) } }).catch(() => {});
  logger.info("admin.toggle_approval", { actorId, boardId, requireApproval: !board.requireApproval });
  revalidateTag("boards");
  redirect(ADMIN_TAB("boards"));
}

export async function clearBoardAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const boardId = String(formData.get("boardId") ?? "");
  const board = await db.board.findUnique({ where: { id: boardId }, select: { id: true, name: true } });
  if (!board) redirect(ADMIN_TAB("boards") + "&error=not_found");
  const threads = await db.thread.findMany({ where: { boardId }, select: { id: true } });
  const threadIds = threads.map((t) => t.id);
  const atts = threadIds.length ? await db.attachment.findMany({ where: { post: { threadId: { in: threadIds } } }, select: { storedName: true } }) : [];
  await db.thread.deleteMany({ where: { boardId } });
  await Promise.all(threadIds.map((id) => settlePendingReports("thread", id, false)));
  const storage = getStorage();
  await Promise.all(atts.map((a) => storage.remove(a.storedName)));
  await db.auditLog.create({ data: { actorId, action: "clear_board", targetType: "board", targetId: boardId } }).catch(() => {});
  logger.info("admin.clear_board", { actorId, boardId, count: threadIds.length });
  revalidateTag("boards");
  revalidateTag("stats");
  revalidateTag("threads");
  revalidatePath("/");
  redirect(ADMIN_TAB("boards"));
}

export async function mergeBoardAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const sourceId = String(formData.get("sourceId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  if (sourceId === targetId) redirect(ADMIN_TAB("boards") + "&error=invalid");
  const [source, target] = await Promise.all([
    db.board.findUnique({ where: { id: sourceId }, select: { id: true } }),
    db.board.findUnique({ where: { id: targetId }, select: { id: true } }),
  ]);
  if (!source || !target) redirect(ADMIN_TAB("boards") + "&error=not_found");
  // 分类不跨版块，合并时置空
  await db.thread.updateMany({ where: { boardId: sourceId }, data: { boardId: targetId, categoryId: null } });
  await db.auditLog.create({ data: { actorId, action: "merge_board", targetType: "board", targetId: sourceId, detail: targetId } }).catch(() => {});
  logger.info("admin.merge_board", { actorId, sourceId, targetId });
  revalidateTag("boards");
  revalidateTag("threads");
  revalidatePath("/");
  redirect(ADMIN_TAB("boards"));
}

/* ---------------- 待审队列 ---------------- */

export async function approveThreadAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({ where: { id: threadId }, select: { id: true, boardId: true, authorId: true, title: true, status: true } });
  if (!thread) redirect(ADMIN_TAB("pending") + "&error=not_found");
  if (staff.boardScope && !staff.boardScope.has(thread.boardId)) redirect(ADMIN_TAB("pending") + "&error=not_found");
  if (thread.status !== "pending") redirect(ADMIN_TAB("pending") + "&error=not_found");
  await db.thread.update({ where: { id: threadId }, data: { status: "approved" } });
  await db.post.updateMany({ where: { threadId, authorId: thread.authorId }, data: { status: "approved" } });
  // 补发积分
  const { THREAD_POINTS } = await import("@/lib/levels");
  await db.user.update({ where: { id: thread.authorId }, data: { points: { increment: THREAD_POINTS } } }).catch(() => {});
  await db.notification.create({ data: { userId: thread.authorId, type: "system", title: "主题已过审", body: `你的主题「${thread.title.slice(0, 20)}」已通过审核`, link: `/t/${threadId}` } }).catch(() => {});
  await db.auditLog.create({ data: { actorId: staff.id, action: "approve_thread", targetType: "thread", targetId: threadId } }).catch(() => {});
  logger.info("admin.approve_thread", { actorId: staff.id, threadId });
  revalidateTag("threads");
  revalidateTag("boards");
  revalidateTag("pending");
  redirect(ADMIN_TAB("pending"));
}

export async function rejectThreadAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({ where: { id: threadId }, select: { id: true, boardId: true, status: true } });
  if (!thread) redirect(ADMIN_TAB("pending") + "&error=not_found");
  if (staff.boardScope && !staff.boardScope.has(thread.boardId)) redirect(ADMIN_TAB("pending") + "&error=not_found");
  if (thread.status !== "pending") redirect(ADMIN_TAB("pending") + "&error=not_found");
  const atts = await db.attachment.findMany({ where: { post: { threadId } }, select: { storedName: true } });
  await db.thread.delete({ where: { id: threadId } });
  const storage = getStorage();
  await Promise.all(atts.map((a) => storage.remove(a.storedName)));
  await db.auditLog.create({ data: { actorId: staff.id, action: "reject_thread", targetType: "thread", targetId: threadId } }).catch(() => {});
  logger.info("admin.reject_thread", { actorId: staff.id, threadId });
  revalidateTag("threads");
  revalidateTag("pending");
  redirect(ADMIN_TAB("pending"));
}

export async function approvePostAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const postId = String(formData.get("postId") ?? "");
  const post = await db.post.findUnique({ where: { id: postId }, select: { id: true, threadId: true, authorId: true, status: true, thread: { select: { boardId: true } } } });
  if (!post) redirect(ADMIN_TAB("pending") + "&error=not_found");
  if (staff.boardScope && !staff.boardScope.has(post.thread.boardId)) redirect(ADMIN_TAB("pending") + "&error=not_found");
  if (post.status !== "pending") redirect(ADMIN_TAB("pending") + "&error=not_found");
  await db.post.update({ where: { id: postId }, data: { status: "approved" } });
  await db.thread.update({ where: { id: post.threadId }, data: { lastPostAt: new Date() } });
  const { REPLY_POINTS } = await import("@/lib/levels");
  await db.user.update({ where: { id: post.authorId }, data: { points: { increment: REPLY_POINTS } } }).catch(() => {});
  // 通知被提及和收藏者（与正常回帖一致，简化：仅通知楼主）
  const thread = await db.thread.findUnique({ where: { id: post.threadId }, select: { authorId: true } });
  if (thread && thread.authorId !== post.authorId) {
    await db.notification.create({ data: { userId: thread.authorId, type: "reply", title: "你的主题有新回帖（审核后）", body: "", link: `/t/${post.threadId}` } }).catch(() => {});
  }
  await db.auditLog.create({ data: { actorId: staff.id, action: "approve_post", targetType: "post", targetId: postId } }).catch(() => {});
  logger.info("admin.approve_post", { actorId: staff.id, postId });
  revalidateTag("threads");
  revalidateTag("pending");
  redirect(ADMIN_TAB("pending"));
}

export async function rejectPostAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const postId = String(formData.get("postId") ?? "");
  const post = await db.post.findUnique({ where: { id: postId }, select: { id: true, thread: { select: { boardId: true } }, status: true } });
  if (!post) redirect(ADMIN_TAB("pending") + "&error=not_found");
  if (staff.boardScope && !staff.boardScope.has(post.thread.boardId)) redirect(ADMIN_TAB("pending") + "&error=not_found");
  if (post.status !== "pending") redirect(ADMIN_TAB("pending") + "&error=not_found");
  const atts = await db.attachment.findMany({ where: { postId }, select: { storedName: true } });
  await db.post.delete({ where: { id: postId } });
  const storage = getStorage();
  await Promise.all(atts.map((a) => storage.remove(a.storedName)));
  await db.auditLog.create({ data: { actorId: staff.id, action: "reject_post", targetType: "post", targetId: postId } }).catch(() => {});
  logger.info("admin.reject_post", { actorId: staff.id, postId });
  revalidateTag("threads");
  revalidateTag("pending");
  redirect(ADMIN_TAB("pending"));
}

/* ---------------- 勋章 ---------------- */

const medalNameSchema = z.string().trim().min(1).max(20);
const medalDescSchema = z.string().trim().max(100).optional();
const medalIconSchema = z.string().trim().min(1).max(4);
const medalColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/);

export async function createMedalAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const name = medalNameSchema.safeParse(formData.get("name"));
  const desc = medalDescSchema.safeParse(formData.get("description") ?? "");
  const icon = medalIconSchema.safeParse(formData.get("icon") ?? "🏅");
  const color = medalColorSchema.safeParse(formData.get("color") ?? "#FFF7A8");
  if (!name.success) redirect(ADMIN_TAB("medals") + "&error=invalid");
  const dup = await db.medal.findUnique({ where: { name: name.data } });
  if (dup) redirect(ADMIN_TAB("medals") + "&error=medal_exists");
  await db.medal.create({ data: { name: name.data, description: desc.success ? desc.data || null : null, icon: icon.success ? icon.data : "🏅", color: color.success ? color.data : "#FFF7A8" } });
  await db.auditLog.create({ data: { actorId, action: "create_medal", targetType: "medal", detail: name.data } }).catch(() => {});
  logger.info("admin.create_medal", { actorId, name: name.data });
  revalidateTag("medals");
  redirect(ADMIN_TAB("medals"));
}

export async function deleteMedalAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const m = await db.medal.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!m) redirect(ADMIN_TAB("medals") + "&error=not_found");
  await db.medal.delete({ where: { id } });
  await db.auditLog.create({ data: { actorId, action: "delete_medal", targetType: "medal", targetId: id, detail: m.name } }).catch(() => {});
  logger.info("admin.delete_medal", { actorId, id });
  revalidateTag("medals");
  redirect(ADMIN_TAB("medals"));
}

export async function awardMedalAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const medalId = String(formData.get("medalId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 100) || null;
  const [user, medal] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, username: true } }),
    db.medal.findUnique({ where: { id: medalId }, select: { id: true, name: true } }),
  ]);
  if (!user || !medal) redirect(ADMIN_TAB("medals") + "&error=not_found");
  const dup = await db.userMedal.findUnique({ where: { userId_medalId: { userId, medalId } } });
  if (dup) redirect(ADMIN_TAB("medals") + "&error=medal_owned");
  await db.userMedal.create({ data: { userId, medalId, reason } });
  await db.notification.create({ data: { userId, type: "medal", title: `获得新勋章：${medal.name}`, body: reason ?? medal.name, link: `/u/${encodeURIComponent(user.username)}` } }).catch(() => {});
  await db.auditLog.create({ data: { actorId, action: "award_medal", targetType: "user", targetId: userId, detail: medal.name } }).catch(() => {});
  logger.info("admin.award_medal", { actorId, userId, medalId });
  revalidateTag("medals");
  redirect(ADMIN_TAB("medals"));
}

export async function revokeMedalAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const medalId = String(formData.get("medalId") ?? "");
  const um = await db.userMedal.findUnique({ where: { userId_medalId: { userId, medalId } } });
  if (!um) redirect(ADMIN_TAB("medals") + "&error=not_found");
  await db.userMedal.delete({ where: { id: um.id } });
  await db.auditLog.create({ data: { actorId, action: "revoke_medal", targetType: "user", targetId: userId } }).catch(() => {});
  logger.info("admin.revoke_medal", { actorId, userId, medalId });
  revalidateTag("medals");
  redirect(ADMIN_TAB("medals"));
}

/* ---------------- 敏感词 ---------------- */

export async function addSensitiveWordAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const word = String(formData.get("word") ?? "").trim();
  if (!word) redirect(ADMIN_TAB("words") + "&error=invalid");
  const res = await addSensitiveWord(word);
  if (!res.ok) redirect(ADMIN_TAB("words") + "&error=word_exists");
  await db.auditLog.create({ data: { actorId, action: "add_word", targetType: "sensitive_word", detail: word } }).catch(() => {});
  logger.info("admin.add_word", { actorId, word });
  redirect(ADMIN_TAB("words"));
}

export async function removeSensitiveWordAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(ADMIN_TAB("words") + "&error=invalid");
  await removeSensitiveWord(id);
  await db.auditLog.create({ data: { actorId, action: "remove_word", targetType: "sensitive_word", targetId: id } }).catch(() => {});
  logger.info("admin.remove_word", { actorId, id });
  redirect(ADMIN_TAB("words"));
}
