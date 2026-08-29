"use server";

import { redirect } from "next/navigation";
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

const ADMIN_TAB = (tab: string) => `/admin?tab=${tab}` as const;

/** 管理操作统一鉴权:非 ADMIN 一律回登录页 */
async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) redirect("/login");
}

/* ---------------- 主题管理 ---------------- */

export async function adminTogglePinAction(formData: FormData): Promise<void> {
  await requireAdmin();
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
  redirect(ADMIN_TAB("threads"));
}

export async function adminToggleLockAction(formData: FormData): Promise<void> {
  await requireAdmin();
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
  redirect(ADMIN_TAB("threads"));
}

export async function adminDeleteThreadAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true },
  });
  if (!thread) redirect(ADMIN_TAB("threads") + "&error=not_found");
  await deleteThread(threadId);
  redirect(ADMIN_TAB("threads"));
}

/* ---------------- 帖子管理 ---------------- */

export async function adminDeletePostAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const postId = String(formData.get("postId") ?? "");
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  if (!post) redirect(ADMIN_TAB("posts") + "&error=not_found");
  await deletePost(postId);
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
  redirect(ADMIN_TAB("users"));
}

export async function addPointsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const delta = z.coerce.number().int().min(-1000).max(1000).safeParse(formData.get("points"));
  if (!delta.success) redirect(ADMIN_TAB("users") + "&error=invalid");
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) redirect(ADMIN_TAB("users") + "&error=not_found");

  await db.user.update({
    where: { id: userId },
    data: { points: { increment: delta.data } },
  });
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
  await requireAdmin();
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
  redirect(ADMIN_TAB("boards"));
}

export async function deleteBoardAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const boardId = String(formData.get("boardId") ?? "");
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { id: true },
  });
  if (!board) redirect(ADMIN_TAB("boards") + "&error=not_found");

  // 版块级联删掉所有主题/帖子,磁盘附件手工清理,相关举报静默结案
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
  // 目标已删,相关举报失去意义,静默结案
  await Promise.all(threadIds.map((id) => settlePendingReports("thread", id, false)));

  const storage = getStorage();
  await Promise.all(atts.map((a) => storage.remove(a.storedName)));
  redirect(ADMIN_TAB("boards"));
}

/** 上移/下移:和相邻版块交换 order */
export async function moveBoardAction(formData: FormData): Promise<void> {
  await requireAdmin();
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
  if (!neighbor) redirect(ADMIN_TAB("boards")); // 已在边界,原地不动

  await db.$transaction([
    db.board.update({ where: { id: board.id }, data: { order: neighbor.order } }),
    db.board.update({ where: { id: neighbor.id }, data: { order: board.order } }),
  ]);
  redirect(ADMIN_TAB("boards"));
}

/* ---------------- 举报队列 ---------------- */

const reviewActionSchema = z.enum(["delete_thread", "delete_post", "ignore", "reject"]);

export async function reviewReportAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const reportId = String(formData.get("reportId") ?? "");
  const action = reviewActionSchema.safeParse(formData.get("action"));
  if (!action.success) redirect(ADMIN_TAB("reports") + "&error=invalid");

  const result = await reviewReport(reportId, action.data as ReviewAction);
  if (!result.ok) {
    redirect(ADMIN_TAB("reports") + "&error=" + (result.status === 409 ? "already_processed" : "not_found"));
  }
  redirect(ADMIN_TAB("reports"));
}