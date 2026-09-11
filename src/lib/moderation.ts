/**
 * 举报/审核核心逻辑:举报的创建与结案、目标删除、结果通知。
 * 页面与 server action 统一走这里,避免各路由各写一套。
 */
import { db } from "./db";
import { checkRateLimit } from "./ratelimit";
import { getStorage } from "./storage";
import { containsSensitive } from "./sensitive";
import { logger } from "./logger";

export const REPORT_REASON_MIN = 5;
export const REPORT_REASON_MAX = 500;
export type ReportTargetType = "thread" | "post";

export interface ReportResult {
  ok: boolean;
  error?: string;
  status?: number;
}

/** 给举报人发一条类型为 report 的通知 */
export async function notifyReporter(
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  await db.notification.create({
    data: { userId, type: "report", title, body },
  });
}

/**
 * 把某个目标上所有 pending 举报结案(目标被删后这些举报都失去意义)。
 * notify 时告知举报人结果;批量场景(如删版块)静默结案即可。
 */
export async function settlePendingReports(
  targetType: ReportTargetType,
  targetId: string,
  notify: boolean,
): Promise<void> {
  const pending = await db.report.findMany({
    where: { targetType, targetId, status: "pending" },
    select: { id: true, reporterId: true },
  });
  if (pending.length === 0) return;
  await db.report.updateMany({
    where: { id: { in: pending.map((r) => r.id) } },
    data: { status: "resolved" },
  });
  if (notify) {
    await Promise.all(
      pending.map((r) =>
        notifyReporter(r.reporterId, "举报已处理", "你举报的内容已被管理员删除。"),
      ),
    );
  }
}

/* 删除分两层：
 * - 软删除（softDelete*）：status=deleted + 记删除人/时间/原因，进回收站，附件保留可恢复
 * - 彻底删除（deleteThread/deletePost）：DB 行级联 + 磁盘附件清理，只由回收站清理调用
 */

export const TRASH_RETENTION_DAYS = 30;

/** 删除原因最长长度（会随通知发给作者） */
export const DELETE_REASON_MAX = 200;

/** 通知作者内容被删除；reason 为空时给一句通用说明 */
async function notifyAuthorRemoved(opts: {
  authorId: string;
  targetType: "thread" | "post";
  title: string;
  reason: string;
  canRestore: boolean;
}): Promise<void> {
  const label = opts.targetType === "thread" ? "主题" : "回复";
  const title = `你的${label}已被删除`;
  const lines = [
    opts.title ? `《${opts.title.slice(0, 40)}》` : "",
    opts.reason ? `原因：${opts.reason}` : "原因：违反社区规范",
    opts.canRestore ? `如有疑问可在 ${TRASH_RETENTION_DAYS} 天内联系管理员申诉，内容暂存于回收站。` : "",
  ].filter(Boolean);
  await db
    .notification.create({
      data: { userId: opts.authorId, type: "moderation", title, body: lines.join("\n"), link: "/notifications" },
    })
    .catch(() => {});
}

/** 软删除主题:进回收站，可恢复；作者收到通知 */
export async function softDeleteThread(
  threadId: string,
  opts: { actorId: string; reason?: string; byModerator?: boolean } = { actorId: "system" },
): Promise<void> {
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { authorId: true, title: true, status: true },
  });
  if (!thread || thread.status === "deleted") return;
  const reason = (opts.reason ?? "").trim().slice(0, DELETE_REASON_MAX);
  await db.thread.update({
    where: { id: threadId },
    data: { status: "deleted", deletedAt: new Date(), deletedBy: opts.actorId, deleteReason: reason },
  });
  await settlePendingReports("thread", threadId, true);
  await notifyAuthorRemoved({
    authorId: thread.authorId,
    targetType: "thread",
    title: thread.title,
    reason,
    canRestore: true,
  });
}

/** 软删除回复:进回收站，可恢复；作者收到通知 */
export async function softDeletePost(
  postId: string,
  opts: { actorId: string; reason?: string } = { actorId: "system" },
): Promise<void> {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { authorId: true, status: true, thread: { select: { title: true } } },
  });
  if (!post || post.status === "deleted") return;
  const reason = (opts.reason ?? "").trim().slice(0, DELETE_REASON_MAX);
  await db.post.update({
    where: { id: postId },
    data: { status: "deleted", deletedAt: new Date(), deletedBy: opts.actorId, deleteReason: reason },
  });
  await settlePendingReports("post", postId, true);
  await notifyAuthorRemoved({
    authorId: post.authorId,
    targetType: "post",
    title: post.thread?.title ?? "",
    reason,
    canRestore: true,
  });
}

/** 从回收站恢复（主题/回复），并把原因/删除人清空 */
export async function restoreFromTrash(targetType: "thread" | "post", targetId: string): Promise<void> {
  const data = { status: "approved", deletedAt: null, deletedBy: null, deleteReason: null };
  if (targetType === "thread") await db.thread.update({ where: { id: targetId }, data });
  else await db.post.update({ where: { id: targetId }, data });
}

/** 彻底删除主题:DB 行级联 + 磁盘附件清理（回收站清理用） */
export async function deleteThread(threadId: string): Promise<void> {
  const atts = await db.attachment.findMany({
    where: { post: { threadId } },
    select: { storedName: true },
  });
  await db.thread.delete({ where: { id: threadId } });
  await deleteStored(atts.map((a) => a.storedName));
  await settlePendingReports("thread", threadId, true);
}

/** 彻底删除帖子:DB 行级联 + 磁盘附件清理（回收站清理用） */
export async function deletePost(postId: string): Promise<void> {
  const atts = await db.attachment.findMany({
    where: { postId },
    select: { storedName: true },
  });
  await db.post.delete({ where: { id: postId } });
  await deleteStored(atts.map((a) => a.storedName));
  await settlePendingReports("post", postId, true);
}

/**
 * 清理回收站：把超过保留期的已删内容彻底删除（含附件）。
 * 由后台回收站页触发，Redis 锁保证一天最多跑一次。
 */
export async function purgeExpiredTrash(): Promise<{ threads: number; posts: number }> {
  const { getRedis } = await import("./redis");
  const redis = getRedis();
  const lockKey = "trash:purge:lock";
  if (redis) {
    const got = await redis.set(lockKey, "1", "EX", 6 * 3600, "NX").catch(() => null);
    if (!got) return { threads: 0, posts: 0 };
  }
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const [threads, posts] = await Promise.all([
    db.thread.findMany({ where: { status: "deleted", deletedAt: { lt: cutoff } }, select: { id: true }, take: 200 }),
    db.post.findMany({ where: { status: "deleted", deletedAt: { lt: cutoff } }, select: { id: true }, take: 500 }),
  ]);
  for (const t of threads) await deleteThread(t.id).catch(() => {});
  for (const p of posts) await deletePost(p.id).catch(() => {});
  if (threads.length || posts.length) {
    logger.info("trash.purged", { threads: threads.length, posts: posts.length, retentionDays: TRASH_RETENTION_DAYS });
  }
  return { threads: threads.length, posts: posts.length };
}

/** 回收站条目：主题与回复合并成一条时间线 */
export interface TrashItem {
  type: "thread" | "post";
  id: string;
  title: string;
  excerpt: string;
  authorName: string;
  threadId: string | null;
  threadTitle: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  deletedByName: string | null;
  reason: string;
}

export async function listTrash(limit = 60): Promise<TrashItem[]> {
  const [threads, posts] = await Promise.all([
    db.thread.findMany({
      where: { status: "deleted" },
      orderBy: { deletedAt: "desc" },
      take: limit,
      select: { id: true, title: true, authorId: true, deletedAt: true, deletedBy: true, deleteReason: true },
    }),
    db.post.findMany({
      where: { status: "deleted" },
      orderBy: { deletedAt: "desc" },
      take: limit,
      select: {
        id: true,
        contentMd: true,
        authorId: true,
        deletedAt: true,
        deletedBy: true,
        deleteReason: true,
        thread: { select: { id: true, title: true } },
      },
    }),
  ]);
  const userIds = [
    ...new Set([...threads.map((t) => t.authorId), ...threads.map((t) => t.deletedBy), ...posts.map((p) => p.authorId), ...posts.map((p) => p.deletedBy)].filter(Boolean) as string[]),
  ];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.username]));

  const items: TrashItem[] = [
    ...threads.map((t) => ({
      type: "thread" as const,
      id: t.id,
      title: t.title,
      excerpt: "",
      authorName: nameOf.get(t.authorId) ?? "已注销",
      threadId: t.id,
      threadTitle: t.title,
      deletedAt: t.deletedAt,
      deletedBy: t.deletedBy,
      deletedByName: t.deletedBy ? nameOf.get(t.deletedBy) ?? "系统" : null,
      reason: t.deleteReason ?? "",
    })),
    ...posts.map((p) => ({
      type: "post" as const,
      id: p.id,
      title: "",
      excerpt: p.contentMd.replace(/\s+/g, " ").slice(0, 120),
      authorName: nameOf.get(p.authorId) ?? "已注销",
      threadId: p.thread?.id ?? null,
      threadTitle: p.thread?.title ?? null,
      deletedAt: p.deletedAt,
      deletedBy: p.deletedBy,
      deletedByName: p.deletedBy ? nameOf.get(p.deletedBy) ?? "系统" : null,
      reason: p.deleteReason ?? "",
    })),
  ];
  return items.sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0)).slice(0, limit);
}

async function deleteStored(names: string[]): Promise<void> {
  if (names.length === 0) return;
  const storage = getStorage();
  await Promise.all(names.map((n) => storage.remove(n)));
}

/**
 * 普通用户提交举报:
 * - 目标必须存在、不能举报自己
 * - Redis 限流(降级放行)
 * - 同一目标已有 pending 举报时去重
 */
export async function createReport(
  reporterId: string,
  targetType: string,
  targetId: string,
  reason: string,
): Promise<ReportResult> {
  const trimmed = reason.trim();
  if (
    trimmed.length < REPORT_REASON_MIN ||
    trimmed.length > REPORT_REASON_MAX
  ) {
    return { ok: false, error: "举报理由需在 5~500 字之间", status: 400 };
  }
  if (await containsSensitive(trimmed)) {
    logger.info("moderation.blocked_sensitive", { reporterId, targetType });
    return { ok: false, error: "举报理由包含敏感词，请修改后重试", status: 400 };
  }
  if (targetType !== "thread" && targetType !== "post") {
    return { ok: false, error: "不支持该举报类型", status: 400 };
  }

  const target =
    targetType === "thread"
      ? await db.thread.findUnique({
          where: { id: targetId },
          select: { authorId: true },
        })
      : await db.post.findUnique({
          where: { id: targetId },
          select: { authorId: true },
        });
  if (!target) {
    return { ok: false, error: "目标不存在或已被删除", status: 404 };
  }
  if (target.authorId === reporterId) {
    return { ok: false, error: "不能举报自己的内容", status: 400 };
  }

  // 每个用户每小时最多 10 条,防刷举报
  if (!(await checkRateLimit(`report:${reporterId}`, 10, 3600))) {
    return { ok: false, error: "举报太频繁，请稍后再试", status: 429 };
  }

  const dup = await db.report.findFirst({
    where: { reporterId, targetType, targetId, status: "pending" },
    select: { id: true },
  });
  if (dup) {
    return { ok: false, error: "该内容已在审核队列中", status: 409 };
  }

  await db.report.create({
    data: {
      reporterId,
      targetType: targetType as ReportTargetType,
      targetId,
      reason: trimmed,
    },
  });
  // 通知:管理员 + 该版块版主(便于及时处理)
  void notifyReportStaff(reporterId, targetType as ReportTargetType, targetId, trimmed).catch(() => {});
  return { ok: true };
}

/** 举报成功后通知该版块的版主与所有管理员 */
async function notifyReportStaff(
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string,
  reason: string,
): Promise<void> {
  try {
    let boardId: string | null = null;
    let boardName: string | null = null;
    if (targetType === "thread") {
      const t = await db.thread.findUnique({
        where: { id: targetId },
        select: { boardId: true, board: { select: { name: true } } },
      });
      boardId = (t as { boardId?: string } | null)?.boardId ?? null;
      boardName = (t as { board?: { name?: string } } | null)?.board?.name ?? null;
    } else {
      const p = await db.post.findUnique({
        where: { id: targetId },
        select: { thread: { select: { boardId: true, board: { select: { name: true } } } } },
      });
      const th = (p as { thread?: { boardId?: string; board?: { name?: string } } } | null)?.thread ?? null;
      boardId = th?.boardId ?? null;
      boardName = th?.board?.name ?? null;
    }
    // 管理员
    const admins = ((await (db as unknown as { user: { findMany: (a: unknown) => Promise<{ id: string }[]> } }).user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    })) ?? []) as { id: string }[];
    // 版主
    let modIds: string[] = [];
    if (boardId) {
      const mods = ((await (db as unknown as { boardModerator: { findMany: (a: unknown) => Promise<{ userId: string }[]> } }).boardModerator.findMany({
        where: { boardId },
        select: { userId: true },
      })) ?? []) as { userId: string }[];
      modIds = mods.map((m) => m.userId);
    }
    const recipients = new Set<string>([...admins.map((a) => a.id), ...modIds]);
    recipients.delete(reporterId);
    if (recipients.size === 0) return;
    const body = reason.slice(0, 80);
    const title = boardName ? `「${boardName}」收到新举报` : "收到新举报";
    await Promise.all(
      [...recipients].map((uid) =>
        db.notification.create({
          data: { userId: uid, type: "report", title, body, link: "/admin?tab=reports" },
        }),
      ),
    );
  } catch {
    // 通知失败不阻断举报主流程
  }
}

export type ReviewAction = "delete_thread" | "delete_post" | "ignore" | "reject";

/**
 * 管理员处理一条举报:
 * - delete_*:删除违规目标(目标已不存在则只结案),通知举报人
 * - ignore:核实未违规,保留内容
 * - reject:驳回
 */
export async function reviewReport(
  reportId: string,
  action: ReviewAction,
): Promise<ReportResult> {
  const report = await db.report.findUnique({ where: { id: reportId } });
  if (!report) return { ok: false, error: "举报不存在", status: 404 };
  if (report.status !== "pending") {
    return { ok: false, error: "该举报已处理过", status: 409 };
  }

  if (action === "delete_thread" || action === "delete_post") {
    const isThread = action === "delete_thread";
    const target = isThread
      ? await db.thread.findUnique({ where: { id: report.targetId } })
      : await db.post.findUnique({ where: { id: report.targetId } });
    if (target) {
      // 软删除目标（进回收站可恢复）;同目标的所有 pending 举报(含本条)一并结案并通知
      if (isThread) await softDeleteThread(report.targetId, { actorId: "moderation", reason: "举报成立" });
      else await softDeletePost(report.targetId, { actorId: "moderation", reason: "举报成立" });
    } else {
      await db.report.update({
        where: { id: report.id },
        data: { status: "resolved" },
      });
      await notifyReporter(
        report.reporterId,
        "举报已处理",
        "你举报的内容已不存在，无需处理。",
      );
    }
    return { ok: true };
  }

  if (action === "ignore") {
    await db.report.update({
      where: { id: report.id },
      data: { status: "resolved" },
    });
    await notifyReporter(
      report.reporterId,
      "举报已处理",
      "经管理员核实，该内容未违规，未做处理。",
    );
    return { ok: true };
  }

  if (action === "reject") {
    await db.report.update({
      where: { id: report.id },
      data: { status: "rejected" },
    });
    await notifyReporter(
      report.reporterId,
      "举报被驳回",
      "经管理员核实，该举报不符合受理条件，已驳回。",
    );
    return { ok: true };
  }

  return { ok: false, error: "未知操作", status: 400 };
}