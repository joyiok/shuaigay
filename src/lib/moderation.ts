/**
 * 举报/审核核心逻辑:举报的创建与结案、目标删除、结果通知。
 * 页面与 server action 统一走这里,避免各路由各写一套。
 */
import { db } from "./db";
import { checkRateLimit } from "./ratelimit";
import { getStorage } from "./storage";
import { containsSensitive } from "./sensitive";

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

/** 删主题:DB 行级联 + 磁盘附件清理 + 相关举报结案 */
export async function deleteThread(threadId: string): Promise<void> {
  const atts = await db.attachment.findMany({
    where: { post: { threadId } },
    select: { storedName: true },
  });
  await db.thread.delete({ where: { id: threadId } });
  await deleteStored(atts.map((a) => a.storedName));
  await settlePendingReports("thread", threadId, true);
}

/** 删帖子:DB 行级联 + 磁盘附件清理 + 相关举报结案 */
export async function deletePost(postId: string): Promise<void> {
  const atts = await db.attachment.findMany({
    where: { postId },
    select: { storedName: true },
  });
  await db.post.delete({ where: { id: postId } });
  await deleteStored(atts.map((a) => a.storedName));
  await settlePendingReports("post", postId, true);
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
  if (containsSensitive(trimmed)) {
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
  return { ok: true };
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
      // 删除目标;同目标的所有 pending 举报(含本条)一并结案并通知
      if (isThread) await deleteThread(report.targetId);
      else await deletePost(report.targetId);
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