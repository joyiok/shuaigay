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

const ADMIN_TAB = (tab: string) => `/admin?tab=${tab}` as const;

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
  const actorId = await requireAdmin();
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { pinned: true },
  });
  if (!thread) redirect(ADMIN_TAB("threads") + "&error=not_found");
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

export async function adminToggleLockAction(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { locked: true },
  });
  if (!thread) redirect(ADMIN_TAB("threads") + "&error=not_found");
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
  const actorId = await requireAdmin();
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true },
  });
  if (!thread) redirect(ADMIN_TAB("threads") + "&error=not_found");
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
  const actorId = await requireAdmin();
  const postId = String(formData.get("postId") ?? "");
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  if (!post) redirect(ADMIN_TAB("posts") + "&error=not_found");
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
