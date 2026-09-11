/**
 * MCP 管理端操作（admin CLI 的执行层）。
 *
 * 与 AI 自动运营的白名单动作分开：这里面向人工/外部管理指令，覆盖版块、分类、版主、
 * 主题、帖子、用户、勋章、敏感词、举报与全站公告。
 *
 * 安全约定（MCP 工具层强制）：
 * - 所有写操作必须带 confirm=APPLY
 * - 不可逆动作（删版块/删帖/封号/改角色/重置密码等）额外要求 acknowledge=IRREVERSIBLE
 * - 每个实际变更都写 AuditLog，actor 取最早的管理员账号
 * - 单次最多 20 个动作，逐个返回 applied/skipped/failed
 */
import { z } from "zod";
import { db } from "./db";
import { logger } from "./logger";
import { hashPassword } from "./auth";
import { isStrongPassword, passwordSchema } from "./password";
import { deleteThread, deletePost, settlePendingReports, softDeletePost, softDeleteThread } from "./moderation";
import { banUser, unbanUser, isUserBanned } from "./ban";
import { addSensitiveWord, removeSensitiveWord } from "./sensitive";
import { buildAnnouncementRows, chunkIds } from "./notify";

const slugSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/, "slug 仅支持小写字母、数字、短横线");
const boardNameSchema = z.string().trim().min(1).max(30);
const categoryNameSchema = z.string().trim().min(1).max(20);
const usernameSchema = z.string().trim().min(3).max(20);
const idSchema = z.string().trim().min(1).max(64);
const textSchema = (max: number) => z.string().trim().min(1).max(max);

export const MAX_ADMIN_ACTIONS = 20;

export const adminActionSchema = z.discriminatedUnion("type", [
  /* ---------------- 版块 ---------------- */
  z.object({ type: z.literal("create_board"), slug: slugSchema, name: boardNameSchema, description: z.string().trim().max(200).optional(), order: z.number().int().min(0).max(999).optional() }),
  z.object({ type: z.literal("update_board"), boardSlug: slugSchema, name: boardNameSchema.optional(), description: z.string().trim().max(200).optional(), order: z.number().int().min(0).max(999).optional() }),
  z.object({ type: z.literal("delete_board"), boardSlug: slugSchema }),
  z.object({ type: z.literal("set_board_visibility"), boardSlug: slugSchema, hidden: z.boolean() }),
  z.object({ type: z.literal("set_board_lock"), boardSlug: slugSchema, locked: z.boolean() }),
  z.object({ type: z.literal("set_board_approval"), boardSlug: slugSchema, requireApproval: z.boolean() }),
  z.object({ type: z.literal("merge_board"), sourceSlug: slugSchema, targetSlug: slugSchema }),
  z.object({ type: z.literal("clear_board"), boardSlug: slugSchema }),

  /* ---------------- 分类 ---------------- */
  z.object({ type: z.literal("create_category"), boardSlug: slugSchema, name: categoryNameSchema, order: z.number().int().min(0).max(999).optional() }),
  z.object({ type: z.literal("rename_category"), boardSlug: slugSchema, name: categoryNameSchema, newName: categoryNameSchema }),
  z.object({ type: z.literal("delete_category"), boardSlug: slugSchema, name: categoryNameSchema }),
  z.object({ type: z.literal("move_category"), boardSlug: slugSchema, name: categoryNameSchema, order: z.number().int().min(0).max(999) }),

  /* ---------------- 版主 ---------------- */
  z.object({ type: z.literal("add_moderator"), boardSlug: slugSchema, username: usernameSchema }),
  z.object({ type: z.literal("remove_moderator"), boardSlug: slugSchema, username: usernameSchema }),

  /* ---------------- 主题 ---------------- */
  z.object({ type: z.literal("delete_thread"), threadId: idSchema }),
  z.object({ type: z.literal("set_thread_pin"), threadId: idSchema, pinned: z.boolean() }),
  z.object({ type: z.literal("set_thread_digest"), threadId: idSchema, digested: z.boolean() }),
  z.object({ type: z.literal("set_thread_lock"), threadId: idSchema, locked: z.boolean() }),
  z.object({ type: z.literal("set_thread_category"), threadId: idSchema, categoryName: categoryNameSchema.nullable() }),
  z.object({ type: z.literal("move_thread"), threadId: idSchema, boardSlug: slugSchema, categoryName: categoryNameSchema.nullable().optional() }),
  z.object({ type: z.literal("approve_thread"), threadId: idSchema }),
  z.object({ type: z.literal("reject_thread"), threadId: idSchema }),
  z.object({ type: z.literal("send_thread_to_review"), threadId: idSchema }),

  /* ---------------- 帖子 ---------------- */
  z.object({ type: z.literal("delete_post"), postId: idSchema }),
  z.object({ type: z.literal("approve_post"), postId: idSchema }),
  z.object({ type: z.literal("reject_post"), postId: idSchema }),
  z.object({ type: z.literal("send_post_to_review"), postId: idSchema }),

  /* ---------------- 用户 ---------------- */
  z.object({ type: z.literal("create_user"), username: z.string().trim().regex(/^[a-zA-Z0-9_-]{3,20}$/), email: z.string().trim().toLowerCase().email().max(200), password: passwordSchema }),
  z.object({ type: z.literal("set_user_role"), username: usernameSchema, role: z.enum(["USER", "ADMIN"]) }),
  z.object({ type: z.literal("ban_user"), username: usernameSchema, reason: textSchema(200), days: z.number().int().min(1).max(3650).optional() }),
  z.object({ type: z.literal("unban_user"), username: usernameSchema }),
  z.object({ type: z.literal("add_points"), username: usernameSchema, points: z.number().int().min(-1000).max(1000), note: z.string().trim().max(100).optional() }),
  z.object({ type: z.literal("reset_user_password"), username: usernameSchema, newPassword: z.string().min(8).max(72) }),
  z.object({ type: z.literal("award_medal"), username: usernameSchema, medalName: textSchema(30), reason: z.string().trim().max(100).optional() }),
  z.object({ type: z.literal("revoke_medal"), username: usernameSchema, medalName: textSchema(30) }),

  /* ---------------- 举报 ---------------- */
  z.object({ type: z.literal("resolve_report"), reportId: idSchema, decision: z.enum(["ignore", "reject"]), reason: z.string().trim().max(200).optional() }),

  /* ---------------- 敏感词 ---------------- */
  z.object({ type: z.literal("add_sensitive_word"), word: textSchema(50) }),
  z.object({ type: z.literal("remove_sensitive_word"), word: textSchema(50) }),

  /* ---------------- 勋章 ---------------- */
  z.object({ type: z.literal("create_medal"), name: textSchema(30), description: z.string().trim().max(100).optional(), icon: z.string().trim().max(8).optional(), color: z.string().trim().max(20).optional() }),
  z.object({ type: z.literal("delete_medal"), name: textSchema(30) }),

  /* ---------------- 全站公告 ---------------- */
  z.object({ type: z.literal("broadcast_announcement"), title: textSchema(50), body: z.string().trim().max(500).optional(), link: z.string().trim().max(200).optional() }),
]);

export type AdminAction = z.infer<typeof adminActionSchema>;

/** 不可逆动作：执行前必须显式 acknowledge=IRREVERSIBLE */
export const DESTRUCTIVE_ACTIONS: ReadonlySet<AdminAction["type"]> = new Set([
  "delete_board",
  "merge_board",
  "clear_board",
  "delete_category",
  "delete_thread",
  "reject_thread",
  "delete_post",
  "reject_post",
  "set_user_role",
  "ban_user",
  "reset_user_password",
  "delete_medal",
]);

export type DestructiveCheck = { ok: true } | { ok: false; error: string; required: AdminAction["type"][] };

/** 校验不可逆动作的二次确认；有任一不可逆动作但没确认时整体拒绝（不做部分执行） */
export function checkDestructiveAck(actions: readonly AdminAction[], acknowledge?: string): DestructiveCheck {
  const required = [...new Set(actions.filter((a) => DESTRUCTIVE_ACTIONS.has(a.type)).map((a) => a.type))];
  if (required.length === 0 || acknowledge === "IRREVERSIBLE") return { ok: true };
  return {
    ok: false,
    required,
    error: `包含不可逆操作（${required.join(", ")}），请在调用参数里传 acknowledge="IRREVERSIBLE" 明确确认`,
  };
}

export interface AdminActionResult {
  index: number;
  type: AdminAction["type"];
  target: string;
  status: "planned" | "applied" | "skipped" | "failed";
  message: string;
}

export interface AdminRunResult {
  dryRun: boolean;
  results: AdminActionResult[];
  applied: number;
  skipped: number;
  failed: number;
}

type ExecResult = { status: "planned" | "applied" | "skipped"; message: string; mutated?: boolean };
const planned = (message: string): ExecResult => ({ status: "planned", message });
const applied = (message: string): ExecResult => ({ status: "applied", message, mutated: true });
const skipped = (message: string): ExecResult => ({ status: "skipped", message });

function targetOf(action: AdminAction): string {
  const a = action as unknown as Record<string, unknown>;
  for (const key of ["boardSlug", "threadId", "postId", "reportId", "username", "word", "name", "slug"]) {
    const v = a[key];
    if (typeof v === "string" && v) return v;
  }
  if (typeof a.sourceSlug === "string" && typeof a.targetSlug === "string") return `${a.sourceSlug}→${a.targetSlug}`;
  return "-";
}

async function actorId(): Promise<string> {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!admin) throw new Error("没有可供审计的管理员账号");
  return admin.id;
}

async function audit(actor: string, action: string, targetType: string, targetId: string, detail?: string): Promise<void> {
  // MCP/外部管理指令与后台人工操作区分归因：统一加 mcp_ 前缀，避免审计时误认成人管点击
  const tagged = action.startsWith("mcp_") || action.startsWith("ai_") ? action : `mcp_${action}`;
  await db.auditLog
    .create({ data: { actorId: actor, action: tagged, targetType, targetId, detail: detail ?? null } })
    .catch(() => {});
}

async function findBoard(slug: string) {
  return db.board.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, isHidden: true, isLocked: true, requireApproval: true } });
}

async function findUser(username: string) {
  return db.user.findUnique({ where: { username }, select: { id: true, username: true, role: true, points: true } });
}

/** 执行单个动作；dryRun 时只做存在性检查并返回 planned */
async function runOne(action: AdminAction, actor: string, dryRun: boolean): Promise<ExecResult> {
  switch (action.type) {
    /* ---------------- 版块 ---------------- */
    case "create_board": {
      const dup = await findBoard(action.slug);
      if (dup) return skipped(`版块 ${action.slug} 已存在`);
      if (dryRun) return planned(`将创建版块「${action.name}」(${action.slug})`);
      await db.board.create({
        data: { slug: action.slug, name: action.name, description: action.description ?? null, order: action.order ?? 0 },
      });
      await audit(actor, "create_board", "board", action.slug, action.name);
      return applied(`已创建版块「${action.name}」(${action.slug})`);
    }
    case "update_board": {
      const board = await findBoard(action.boardSlug);
      if (!board) return skipped("版块不存在");
      if (dryRun) return planned(`将更新版块「${board.name}」`);
      await db.board.update({
        where: { id: board.id },
        data: {
          ...(action.name !== undefined ? { name: action.name } : {}),
          ...(action.description !== undefined ? { description: action.description } : {}),
          ...(action.order !== undefined ? { order: action.order } : {}),
        },
      });
      await audit(actor, "update_board", "board", board.id, action.boardSlug);
      return applied(`已更新版块「${action.name ?? board.name}」`);
    }
    case "delete_board": {
      const board = await findBoard(action.boardSlug);
      if (!board) return skipped("版块不存在");
      const threads = await db.thread.findMany({ where: { boardId: board.id }, select: { id: true } });
      if (dryRun) return planned(`将删除版块「${board.name}」及其 ${threads.length} 个主题（含附件与举报结案）`);
      for (const t of threads) await deleteThread(t.id);
      await db.board.delete({ where: { id: board.id } });
      await audit(actor, "delete_board", "board", board.id, action.boardSlug);
      return applied(`已删除版块「${board.name}」及 ${threads.length} 个主题`);
    }
    case "set_board_visibility": {
      const board = await findBoard(action.boardSlug);
      if (!board) return skipped("版块不存在");
      if (board.isHidden === action.hidden) return skipped("状态无需变更");
      if (dryRun) return planned(`将${action.hidden ? "隐藏" : "显示"}版块「${board.name}」`);
      await db.board.update({ where: { id: board.id }, data: { isHidden: action.hidden } });
      await audit(actor, "toggle_hidden", "board", board.id, action.boardSlug);
      return applied(`已${action.hidden ? "隐藏" : "显示"}版块「${board.name}」`);
    }
    case "set_board_lock": {
      const board = await findBoard(action.boardSlug);
      if (!board) return skipped("版块不存在");
      if (board.isLocked === action.locked) return skipped("状态无需变更");
      if (dryRun) return planned(`将${action.locked ? "锁定" : "解锁"}版块「${board.name}」`);
      await db.board.update({ where: { id: board.id }, data: { isLocked: action.locked } });
      await audit(actor, "toggle_locked", "board", board.id, action.boardSlug);
      return applied(`已${action.locked ? "锁定" : "解锁"}版块「${board.name}」`);
    }
    case "set_board_approval": {
      const board = await findBoard(action.boardSlug);
      if (!board) return skipped("版块不存在");
      if (board.requireApproval === action.requireApproval) return skipped("状态无需变更");
      if (dryRun) return planned(`将${action.requireApproval ? "开启" : "关闭"}版块「${board.name}」的审核`);
      await db.board.update({ where: { id: board.id }, data: { requireApproval: action.requireApproval } });
      await audit(actor, "toggle_approval", "board", board.id, action.boardSlug);
      return applied(`已${action.requireApproval ? "开启" : "关闭"}审核`);
    }
    case "merge_board": {
      const source = await findBoard(action.sourceSlug);
      const target = await findBoard(action.targetSlug);
      if (!source || !target) return skipped("源版块或目标版块不存在");
      if (source.id === target.id) return skipped("源版块和目标版块相同");
      const count = await db.thread.count({ where: { boardId: source.id } });
      if (dryRun) return planned(`将把「${source.name}」的 ${count} 个主题并入「${target.name}」并删除源版块`);
      await db.thread.updateMany({ where: { boardId: source.id }, data: { boardId: target.id, categoryId: null } });
      await db.board.delete({ where: { id: source.id } });
      await audit(actor, "merge_board", "board", source.id, action.targetSlug);
      return applied(`已把「${source.name}」的 ${count} 个主题并入「${target.name}」`);
    }
    case "clear_board": {
      const board = await findBoard(action.boardSlug);
      if (!board) return skipped("版块不存在");
      const threads = await db.thread.findMany({ where: { boardId: board.id }, select: { id: true } });
      if (dryRun) return planned(`将清空版块「${board.name}」的 ${threads.length} 个主题`);
      for (const t of threads) await deleteThread(t.id);
      await audit(actor, "clear_board", "board", board.id, action.boardSlug);
      return applied(`已清空版块「${board.name}」的 ${threads.length} 个主题`);
    }

    /* ---------------- 分类 ---------------- */
    case "create_category": {
      const board = await findBoard(action.boardSlug);
      if (!board) return skipped("版块不存在");
      const dup = await db.threadCategory.findUnique({ where: { boardId_name: { boardId: board.id, name: action.name } } });
      if (dup) return skipped("同名分类已存在");
      if (dryRun) return planned(`将在「${board.name}」下新建分类「${action.name}」`);
      await db.threadCategory.create({ data: { boardId: board.id, name: action.name, order: action.order ?? 0 } });
      await audit(actor, "create_category", "board", board.id, `${action.boardSlug}:${action.name}`);
      return applied(`已新建分类「${action.name}」`);
    }
    case "rename_category": {
      const board = await findBoard(action.boardSlug);
      if (!board) return skipped("版块不存在");
      const cat = await db.threadCategory.findUnique({ where: { boardId_name: { boardId: board.id, name: action.name } } });
      if (!cat) return skipped("分类不存在");
      if (dryRun) return planned(`将分类「${action.name}」改名为「${action.newName}」`);
      await db.threadCategory.update({ where: { id: cat.id }, data: { name: action.newName } });
      await audit(actor, "rename_category", "board", board.id, `${action.name}→${action.newName}`);
      return applied(`已改名为「${action.newName}」`);
    }
    case "delete_category": {
      const board = await findBoard(action.boardSlug);
      if (!board) return skipped("版块不存在");
      const cat = await db.threadCategory.findUnique({ where: { boardId_name: { boardId: board.id, name: action.name } } });
      if (!cat) return skipped("分类不存在");
      const count = await db.thread.count({ where: { categoryId: cat.id } });
      if (dryRun) return planned(`将删除分类「${action.name}」，${count} 个主题回落为未分类`);
      await db.threadCategory.delete({ where: { id: cat.id } });
      await audit(actor, "delete_category", "board", board.id, action.name);
      return applied(`已删除分类「${action.name}」`);
    }
    case "move_category": {
      const board = await findBoard(action.boardSlug);
      if (!board) return skipped("版块不存在");
      const cat = await db.threadCategory.findUnique({ where: { boardId_name: { boardId: board.id, name: action.name } } });
      if (!cat) return skipped("分类不存在");
      if (cat.order === action.order) return skipped("顺序无需变更");
      if (dryRun) return planned(`将分类「${action.name}」顺序改为 ${action.order}`);
      await db.threadCategory.update({ where: { id: cat.id }, data: { order: action.order } });
      await audit(actor, "move_category", "board", board.id, `${action.name}:${action.order}`);
      return applied(`已把「${action.name}」顺序改为 ${action.order}`);
    }

    /* ---------------- 版主 ---------------- */
    case "add_moderator": {
      const board = await findBoard(action.boardSlug);
      const user = await findUser(action.username);
      if (!board || !user) return skipped("版块或用户不存在");
      const dup = await db.boardModerator.findUnique({ where: { boardId_userId: { boardId: board.id, userId: user.id } } });
      if (dup) return skipped("该用户已是此版块版主");
      if (dryRun) return planned(`将任命 ${user.username} 为「${board.name}」版主`);
      await db.boardModerator.create({ data: { boardId: board.id, userId: user.id } });
      await audit(actor, "set_moderator", "user", user.id, action.boardSlug);
      return applied(`已任命 ${user.username} 为版主`);
    }
    case "remove_moderator": {
      const board = await findBoard(action.boardSlug);
      const user = await findUser(action.username);
      if (!board || !user) return skipped("版块或用户不存在");
      const row = await db.boardModerator.findUnique({ where: { boardId_userId: { boardId: board.id, userId: user.id } } });
      if (!row) return skipped("该用户不是此版块版主");
      if (dryRun) return planned(`将撤免 ${user.username} 的「${board.name}」版主`);
      await db.boardModerator.delete({ where: { id: row.id } });
      await audit(actor, "remove_moderator", "user", user.id, action.boardSlug);
      return applied(`已撤免 ${user.username} 的版主`);
    }

    /* ---------------- 主题 ---------------- */
    case "delete_thread": {
      const thread = await db.thread.findUnique({ where: { id: action.threadId }, select: { id: true, title: true } });
      if (!thread) return skipped("主题不存在");
      if (dryRun) return planned(`将删除主题「${thread.title}」（进回收站，${30} 天可恢复）`);
      await softDeleteThread(thread.id, { actorId: actor, reason: "AI/批量运营删除" });
      await audit(actor, "delete_thread", "thread", thread.id, thread.title.slice(0, 60));
      return applied(`已删除主题「${thread.title}」`);
    }
    case "set_thread_pin": {
      const thread = await db.thread.findUnique({ where: { id: action.threadId }, select: { id: true, title: true, pinned: true } });
      if (!thread) return skipped("主题不存在");
      if (thread.pinned === action.pinned) return skipped("状态无需变更");
      if (dryRun) return planned(`将${action.pinned ? "置顶" : "取消置顶"}「${thread.title}」`);
      await db.thread.update({ where: { id: thread.id }, data: { pinned: action.pinned } });
      await audit(actor, "toggle_pin", "thread", thread.id);
      return applied(`已${action.pinned ? "置顶" : "取消置顶"}「${thread.title}」`);
    }
    case "set_thread_digest": {
      const thread = await db.thread.findUnique({ where: { id: action.threadId }, select: { id: true, title: true, digested: true, authorId: true } });
      if (!thread) return skipped("主题不存在");
      if (thread.digested === action.digested) return skipped("状态无需变更");
      if (dryRun) return planned(`将${action.digested ? "加精" : "取消加精"}「${thread.title}」`);
      await db.thread.update({ where: { id: thread.id }, data: { digested: action.digested } });
      if (action.digested && thread.authorId !== actor) {
        await db.notification
          .create({ data: { userId: thread.authorId, type: "digest", title: `你的主题「${thread.title.slice(0, 30)}」被加精了`, link: `/t/${thread.id}` } })
          .catch(() => {});
      }
      await audit(actor, "toggle_digest", "thread", thread.id);
      return applied(`已${action.digested ? "加精" : "取消加精"}「${thread.title}」`);
    }
    case "set_thread_lock": {
      const thread = await db.thread.findUnique({ where: { id: action.threadId }, select: { id: true, title: true, locked: true } });
      if (!thread) return skipped("主题不存在");
      if (thread.locked === action.locked) return skipped("状态无需变更");
      if (dryRun) return planned(`将${action.locked ? "锁定" : "解锁"}「${thread.title}」`);
      await db.thread.update({ where: { id: thread.id }, data: { locked: action.locked } });
      await audit(actor, "toggle_lock", "thread", thread.id);
      return applied(`已${action.locked ? "锁定" : "解锁"}「${thread.title}」`);
    }
    case "set_thread_category": {
      const thread = await db.thread.findUnique({ where: { id: action.threadId }, select: { id: true, title: true, boardId: true, categoryId: true } });
      if (!thread) return skipped("主题不存在");
      let categoryId: string | null = null;
      if (action.categoryName) {
        const cat = await db.threadCategory.findUnique({ where: { boardId_name: { boardId: thread.boardId, name: action.categoryName } }, select: { id: true } });
        if (!cat) return skipped("该版块没有这个分类");
        categoryId = cat.id;
      }
      if (thread.categoryId === categoryId) return skipped("分类无需变更");
      if (dryRun) return planned(`将「${thread.title}」归入 ${action.categoryName ?? "未分类"}`);
      await db.thread.update({ where: { id: thread.id }, data: { categoryId } });
      await audit(actor, "set_category", "thread", thread.id, action.categoryName ?? "");
      return applied(`已归入 ${action.categoryName ?? "未分类"}`);
    }
    case "move_thread": {
      const thread = await db.thread.findUnique({ where: { id: action.threadId }, select: { id: true, title: true, boardId: true } });
      const target = await findBoard(action.boardSlug);
      if (!thread || !target) return skipped("主题或目标版块不存在");
      let categoryId: string | null = null;
      if (action.categoryName) {
        const cat = await db.threadCategory.findUnique({ where: { boardId_name: { boardId: target.id, name: action.categoryName } }, select: { id: true } });
        if (!cat) return skipped("目标版块没有该分类");
        categoryId = cat.id;
      }
      if (thread.boardId === target.id && categoryId === null) return skipped("已在目标版块");
      if (dryRun) return planned(`将「${thread.title}」移动到「${target.name}」`);
      await db.thread.update({ where: { id: thread.id }, data: { boardId: target.id, categoryId } });
      await audit(actor, "move_board", "thread", thread.id, action.boardSlug);
      return applied(`已移动到「${target.name}」`);
    }
    case "approve_thread": {
      const thread = await db.thread.findUnique({ where: { id: action.threadId }, select: { id: true, title: true, authorId: true, status: true } });
      if (!thread) return skipped("主题不存在");
      if (thread.status !== "pending") return skipped("主题不在待审状态");
      if (dryRun) return planned(`将通过主题「${thread.title}」`);
      await db.thread.update({ where: { id: thread.id }, data: { status: "approved" } });
      await db.post.updateMany({ where: { threadId: thread.id, authorId: thread.authorId }, data: { status: "approved" } });
      const { DEFAULT_POINTS_CONFIG, getPointsConfig } = await import("./points-config");
      const threadPoints = (await getPointsConfig().catch(() => DEFAULT_POINTS_CONFIG)).thread;
      await db.user.update({ where: { id: thread.authorId }, data: { points: { increment: threadPoints } } }).catch(() => {});
      await db.notification
        .create({ data: { userId: thread.authorId, type: "system", title: "主题已过审", body: `你的主题「${thread.title.slice(0, 20)}」已通过审核`, link: `/t/${thread.id}` } })
        .catch(() => {});
      await audit(actor, "approve_thread", "thread", thread.id);
      return applied(`已通过主题「${thread.title}」`);
    }
    case "reject_thread": {
      const thread = await db.thread.findUnique({ where: { id: action.threadId }, select: { id: true, title: true, status: true } });
      if (!thread) return skipped("主题不存在");
      if (thread.status !== "pending") return skipped("只拒绝待审主题，已发布内容请用 delete_thread");
      if (dryRun) return planned(`将拒绝待审主题「${thread.title}」（进回收站，30 天可恢复）`);
      await softDeleteThread(thread.id, { actorId: actor, reason: "审核未通过" });
      await audit(actor, "reject_thread", "thread", thread.id, thread.title.slice(0, 60));
      return applied(`已拒绝并删除「${thread.title}」`);
    }
    case "send_thread_to_review": {
      const thread = await db.thread.findUnique({ where: { id: action.threadId }, select: { id: true, title: true, status: true } });
      if (!thread) return skipped("主题不存在");
      if (thread.status === "pending") return skipped("主题已在待审");
      if (dryRun) return planned(`将「${thread.title}」送审`);
      await db.thread.update({ where: { id: thread.id }, data: { status: "pending" } });
      await audit(actor, "send_to_review", "thread", thread.id);
      return applied(`已送审「${thread.title}」`);
    }

    /* ---------------- 帖子 ---------------- */
    case "delete_post": {
      const post = await db.post.findUnique({ where: { id: action.postId }, select: { id: true, threadId: true, contentMd: true } });
      if (!post) return skipped("帖子不存在");
      if (dryRun) return planned(`将删除帖子 ${post.id}（${post.contentMd.slice(0, 30)}），进回收站 30 天可恢复`);
      await softDeletePost(post.id, { actorId: actor, reason: "AI/批量运营删除" });
      await audit(actor, "delete_post", "post", post.id);
      return applied(`已删除帖子 ${post.id}`);
    }
    case "approve_post": {
      const post = await db.post.findUnique({ where: { id: action.postId }, select: { id: true, threadId: true, authorId: true, status: true } });
      if (!post) return skipped("帖子不存在");
      if (post.status !== "pending") return skipped("帖子不在待审状态");
      if (dryRun) return planned(`将通过帖子 ${post.id}`);
      await db.post.update({ where: { id: post.id }, data: { status: "approved" } });
      await db.thread.update({ where: { id: post.threadId }, data: { lastPostAt: new Date() } });
      const { DEFAULT_POINTS_CONFIG, getPointsConfig } = await import("./points-config");
      const replyPoints = (await getPointsConfig().catch(() => DEFAULT_POINTS_CONFIG)).reply;
      await db.user.update({ where: { id: post.authorId }, data: { points: { increment: replyPoints } } }).catch(() => {});
      await audit(actor, "approve_post", "post", post.id);
      return applied(`已通过帖子 ${post.id}`);
    }
    case "reject_post": {
      const post = await db.post.findUnique({ where: { id: action.postId }, select: { id: true, status: true } });
      if (!post) return skipped("帖子不存在");
      if (post.status !== "pending") return skipped("只拒绝待审帖子，已发布内容请用 delete_post");
      if (dryRun) return planned(`将拒绝待审帖子 ${post.id}，进回收站 30 天可恢复`);
      await softDeletePost(post.id, { actorId: actor, reason: "审核未通过" });
      await audit(actor, "reject_post", "post", post.id);
      return applied(`已拒绝并删除帖子 ${post.id}`);
    }
    case "send_post_to_review": {
      const post = await db.post.findUnique({ where: { id: action.postId }, select: { id: true, status: true } });
      if (!post) return skipped("帖子不存在");
      if (post.status === "pending") return skipped("帖子已在待审");
      if (dryRun) return planned(`将帖子 ${post.id} 送审`);
      await db.post.update({ where: { id: post.id }, data: { status: "pending" } });
      await audit(actor, "send_to_review", "post", post.id);
      return applied(`已送审帖子 ${post.id}`);
    }

    /* ---------------- 用户 ---------------- */
    case "create_user": {
      const email = action.email.toLowerCase();
      const existing = await db.user.findFirst({ where: { OR: [{ username: action.username }, { email }] }, select: { username: true } });
      if (existing) return skipped("用户名或邮箱已存在");
      if (dryRun) return planned(`将创建账号 ${action.username}`);
      try {
        const user = await db.user.create({
          data: { username: action.username, email, passwordHash: await hashPassword(action.password), emailVerified: true },
          select: { id: true, username: true },
        });
        await audit(actor, "create_user", "user", user.id, user.username);
        return applied(`已创建账号 ${user.username}`);
      } catch (error) {
        if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") return skipped("用户名或邮箱已存在");
        throw error;
      }
    }
    case "set_user_role": {
      const user = await findUser(action.username);
      if (!user) return skipped("用户不存在");
      if (user.role === action.role) return skipped("角色无需变更");
      if (user.role === "ADMIN" && action.role === "USER") {
        const admins = await db.user.count({ where: { role: "ADMIN" } });
        if (admins <= 1) return skipped("不能降级最后一个管理员");
      }
      if (dryRun) return planned(`将 ${user.username} 角色改为 ${action.role}`);
      await db.user.update({ where: { id: user.id }, data: { role: action.role } });
      await audit(actor, "set_role", "user", user.id, action.role);
      return applied(`已把 ${user.username} 改为 ${action.role}`);
    }
    case "ban_user": {
      const user = await findUser(action.username);
      if (!user) return skipped("用户不存在");
      if (user.role === "ADMIN") return skipped("不能封禁管理员");
      const { banned } = await isUserBanned(user.id);
      if (banned) return skipped("该用户已在封禁中");
      if (dryRun) return planned(`将封禁 ${user.username}（${action.days ? `${action.days} 天` : "永久"}）`);
      await banUser(user.id, action.reason, action.days ?? null);
      await audit(actor, "ban_user", "user", user.id, action.reason);
      return applied(`已封禁 ${user.username}（${action.days ? `${action.days} 天` : "永久"}）`);
    }
    case "unban_user": {
      const user = await findUser(action.username);
      if (!user) return skipped("用户不存在");
      const { banned } = await isUserBanned(user.id);
      if (!banned) return skipped("该用户未被封禁");
      if (dryRun) return planned(`将解封 ${user.username}`);
      await unbanUser(user.id);
      await audit(actor, "unban_user", "user", user.id);
      return applied(`已解封 ${user.username}`);
    }
    case "add_points": {
      const user = await findUser(action.username);
      if (!user) return skipped("用户不存在");
      if (dryRun) return planned(`将给 ${user.username} ${action.points >= 0 ? "+" : ""}${action.points} 积分`);
      await db.user.update({ where: { id: user.id }, data: { points: { increment: action.points } } });
      await audit(actor, "add_points", "user", user.id, `${action.points}${action.note ? ` ${action.note}` : ""}`);
      return applied(`已给 ${user.username} ${action.points >= 0 ? "+" : ""}${action.points} 积分`);
    }
    case "reset_user_password": {
      const user = await findUser(action.username);
      if (!user) return skipped("用户不存在");
      if (!isStrongPassword(action.newPassword)) return skipped("新密码强度不足（8-72 位，非弱密码/全同字符；12 位以下需 4 类占 3 类）");
      if (dryRun) return planned(`将重置 ${user.username} 的密码并踢下线`);
      await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(action.newPassword) } });
      await db.session.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await audit(actor, "reset_password", "user", user.id);
      return applied(`已重置 ${user.username} 的密码并踢下线`);
    }
    case "award_medal": {
      const user = await findUser(action.username);
      const medal = await db.medal.findUnique({ where: { name: action.medalName }, select: { id: true, name: true } });
      if (!user || !medal) return skipped("用户或勋章不存在");
      const dup = await db.userMedal.findUnique({ where: { userId_medalId: { userId: user.id, medalId: medal.id } } });
      if (dup) return skipped("该用户已拥有此勋章");
      if (dryRun) return planned(`将给 ${user.username} 授予「${medal.name}」`);
      await db.userMedal.create({ data: { userId: user.id, medalId: medal.id, reason: action.reason ?? null } });
      await db.notification
        .create({ data: { userId: user.id, type: "medal", title: `获得新勋章：${medal.name}`, body: action.reason ?? medal.name, link: `/u/${encodeURIComponent(user.username)}` } })
        .catch(() => {});
      await audit(actor, "award_medal", "user", user.id, medal.name);
      return applied(`已授予「${medal.name}」`);
    }
    case "revoke_medal": {
      const user = await findUser(action.username);
      const medal = await db.medal.findUnique({ where: { name: action.medalName }, select: { id: true, name: true } });
      if (!user || !medal) return skipped("用户或勋章不存在");
      const owned = await db.userMedal.findUnique({ where: { userId_medalId: { userId: user.id, medalId: medal.id } } });
      if (!owned) return skipped("该用户没有此勋章");
      if (dryRun) return planned(`将移除 ${user.username} 的「${medal.name}」`);
      await db.userMedal.delete({ where: { id: owned.id } });
      await audit(actor, "revoke_medal", "user", user.id, medal.name);
      return applied(`已移除「${medal.name}」`);
    }

    /* ---------------- 举报 ---------------- */
    case "resolve_report": {
      const report = await db.report.findUnique({ where: { id: action.reportId }, select: { id: true, status: true } });
      if (!report) return skipped("举报不存在");
      if (report.status !== "pending") return skipped("该举报已处理过");
      if (dryRun) return planned(`将把举报 ${report.id} 标记为 ${action.decision}`);
      await db.report.update({ where: { id: report.id }, data: { status: action.decision === "ignore" ? "resolved" : "rejected" } });
      await audit(actor, "review_report", "report", report.id, action.reason ?? action.decision);
      return applied(`已处理举报（${action.decision}）`);
    }

    /* ---------------- 敏感词 ---------------- */
    case "add_sensitive_word": {
      const existing = await db.sensitiveWord.findUnique({ where: { word: action.word }, select: { id: true } });
      if (existing) return skipped("该词已存在");
      if (dryRun) return planned(`将添加敏感词「${action.word}」`);
      const res = await addSensitiveWord(action.word);
      if (!res.ok) return skipped(res.error ?? "添加失败");
      await audit(actor, "add_word", "sensitive_word", action.word);
      return applied(`已添加敏感词「${action.word}」`);
    }
    case "remove_sensitive_word": {
      const existing = await db.sensitiveWord.findUnique({ where: { word: action.word }, select: { id: true } });
      if (!existing) return skipped("该词不存在");
      if (dryRun) return planned(`将移除敏感词「${action.word}」`);
      await removeSensitiveWord(existing.id);
      await audit(actor, "remove_word", "sensitive_word", action.word);
      return applied(`已移除敏感词「${action.word}」`);
    }

    /* ---------------- 勋章 ---------------- */
    case "create_medal": {
      const dup = await db.medal.findUnique({ where: { name: action.name }, select: { id: true } });
      if (dup) return skipped("同名勋章已存在");
      if (dryRun) return planned(`将创建勋章「${action.name}」`);
      await db.medal.create({
        data: { name: action.name, description: action.description ?? null, icon: action.icon ?? "🏅", color: action.color ?? "#FFF7A8" },
      });
      await audit(actor, "create_medal", "medal", action.name);
      return applied(`已创建勋章「${action.name}」`);
    }
    case "delete_medal": {
      const medal = await db.medal.findUnique({ where: { name: action.name }, select: { id: true } });
      if (!medal) return skipped("勋章不存在");
      const owned = await db.userMedal.count({ where: { medalId: medal.id } });
      if (dryRun) return planned(`将删除勋章「${action.name}」（${owned} 人持有，一并移除）`);
      await db.medal.delete({ where: { id: medal.id } });
      await audit(actor, "delete_medal", "medal", medal.id, action.name);
      return applied(`已删除勋章「${action.name}」`);
    }

    /* ---------------- 全站公告 ---------------- */
    case "broadcast_announcement": {
      const users = await db.user.findMany({ select: { id: true } });
      if (dryRun) return planned(`将给 ${users.length} 位用户发送公告「${action.title}」`);
      let sent = 0;
      for (const chunk of chunkIds(users.map((u) => u.id), 500)) {
        const rows = buildAnnouncementRows(chunk, {
          title: action.title,
          body: action.body || undefined,
          link: action.link && action.link.startsWith("/") && !action.link.startsWith("//") ? action.link : null,
        });
        if (!rows.length) continue;
        await db.notification.createMany({ data: rows });
        sent += rows.length;
      }
      await audit(actor, "broadcast_announce", "user", "-", `${action.title} (${sent}人)`);
      return applied(`已向 ${sent} 位用户发送公告`);
    }
  }
}

export async function executeAdminActions(actions: readonly AdminAction[], opts: { dryRun?: boolean } = {}): Promise<AdminRunResult> {
  const list = actions.slice(0, MAX_ADMIN_ACTIONS);
  const dryRun = !!opts.dryRun;
  const actor = dryRun ? "" : await actorId();
  const results: AdminActionResult[] = [];
  let mutated = false;
  for (const [index, action] of list.entries()) {
    try {
      const result = await runOne(action, actor, dryRun);
      mutated ||= !!result.mutated;
      results.push({ index, type: action.type, target: targetOf(action), status: result.status, message: result.message });
    } catch (error) {
      logger.error("mcp.admin_action_failed", { type: action.type, error: String(error) });
      results.push({ index, type: action.type, target: targetOf(action), status: "failed", message: "执行失败，详见服务端日志" });
    }
  }
  if (mutated) {
    const { revalidateTag, revalidatePath } = await import("next/cache");
    revalidateTag("boards");
    revalidateTag("threads");
    revalidateTag("stats");
    revalidateTag("pending");
    revalidatePath("/");
  }
  return {
    dryRun,
    results,
    applied: results.filter((r) => r.status === "applied").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
}

/** 管理上下文：版块+分类、待审队列、举报、用户概览与统计（不含邮箱/IP/密码） */
export async function getAdminContext(rawLimit?: number) {
  const limit = Math.max(1, Math.min(60, Math.floor(Number(rawLimit) || 20)));
  const [boards, pendingThreads, pendingPosts, reports, stats, recentUsers] = await Promise.all([
    db.board.findMany({
      orderBy: { order: "asc" },
      select: {
        slug: true, name: true, description: true, order: true, isHidden: true, isLocked: true, requireApproval: true,
        categories: { orderBy: { order: "asc" }, select: { name: true, order: true } },
        _count: { select: { threads: true, moderators: true } },
      },
    }),
    db.thread.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, createdAt: true, board: { select: { slug: true, name: true } }, author: { select: { username: true } } },
    }),
    db.post.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, contentMd: true, createdAt: true, author: { select: { username: true } }, thread: { select: { id: true, title: true } } },
    }),
    db.report.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, targetType: true, targetId: true, reason: true, createdAt: true, reporter: { select: { username: true } } },
    }),
    Promise.all([db.user.count(), db.thread.count(), db.post.count(), db.board.count()]).then(([users, threads, posts, boardCount]) => ({ users, threads, posts, boards: boardCount })),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { username: true, role: true, points: true, createdAt: true },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    stats,
    boards: boards.map((b) => ({
      slug: b.slug, name: b.name, description: b.description, order: b.order,
      isHidden: b.isHidden, isLocked: b.isLocked, requireApproval: b.requireApproval,
      threadCount: b._count.threads, moderatorCount: b._count.moderators,
      categories: b.categories.map((c) => ({ name: c.name, order: c.order })),
    })),
    pendingThreads: pendingThreads.map((t) => ({ id: t.id, title: t.title, boardSlug: t.board.slug, boardName: t.board.name, author: t.author.username, createdAt: t.createdAt })),
    pendingPosts: pendingPosts.map((p) => ({ id: p.id, threadId: p.thread.id, threadTitle: p.thread.title, author: p.author.username, excerpt: p.contentMd.slice(0, 120), createdAt: p.createdAt })),
    pendingReports: reports.map((r) => ({ id: r.id, targetType: r.targetType, targetId: r.targetId, reason: r.reason, reporter: r.reporter.username, createdAt: r.createdAt })),
    recentUsers: recentUsers.map((u) => ({ username: u.username, role: u.role, points: u.points, createdAt: u.createdAt })),
  };
}
