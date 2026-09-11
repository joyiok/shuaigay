"use server";

import { redirect } from "next/navigation";
import { revalidateTag, revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { attachTags, parseTagInput } from "@/lib/taxonomy";
import { createPoll, readPollForm } from "@/lib/poll";
import { softDeletePost, softDeleteThread } from "@/lib/moderation";
import { getCurrentUser } from "@/lib/auth";
import {
  canDeletePost,
  canEditPost,
  canGlobalPin,
  canModerateBoard,
  canMoveThread,
  canReply,
  isAdmin,
} from "@/lib/permissions";
import { REPLY_POINTS, THREAD_POINTS } from "@/lib/levels";
import { isBoardModerator } from "@/lib/moderators";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { containsSensitive } from "@/lib/sensitive";
import { assertNotBanned } from "@/lib/ban";
import { fetchApprovalBoard, fetchApprovalUser, needsApproval } from "@/lib/approval";

// 限流阈值:生产用默认值;本地调试或反复跑 e2e 可经 .env 调大(见 .env.example)
const THREAD_RATE_LIMIT = Number(process.env.RATE_LIMIT_THREAD) || 5;
const REPLY_RATE_LIMIT = Number(process.env.RATE_LIMIT_REPLY) || 10;
const EDIT_RATE_LIMIT = Number(process.env.RATE_LIMIT_EDIT) || 10;
import {
  extensionForMime,
  getStorage,
  maxUploadBytes,
  MAX_FILES_PER_POST,
  type StorageDriver,
} from "@/lib/storage";
import { sniffMime } from "@/lib/filetype";
import { collectMentionCandidates } from "@/lib/markdown";
import {
  excerptForNotify,
  planFavoriteReplyNotifications,
  planMentionNotifications,
  planReplyNotifications,
} from "@/lib/notify";
import { filterRowsByPreferences } from "@/lib/notifications";
import { blockersOf } from "@/lib/block";
import { maybeEmailNotify } from "@/lib/email-notify";
import { after } from "next/server";
import { logger } from "@/lib/logger";

const titleSchema = z.string().trim().min(5).max(120);
const contentSchema = z.string().trim().min(1).max(20_000);

interface PreparedFile {
  buf: Buffer;
  mime: string;
  fileName: string;
}

/** 校验并读取上传文件:只信魔数嗅探,不信浏览器声明的 Content-Type */
async function prepareFiles(
  formData: FormData,
): Promise<{ files: PreparedFile[]; error?: string }> {
  const max = maxUploadBytes();
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES_PER_POST) return { files: [], error: "too_many_files" };
  // 先按声明大小做总量守卫，避免 5 个大文件全读进内存才发现超限（serverActions 上限 25mb 兜底）
  const declaredTotal = files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (declaredTotal > max * MAX_FILES_PER_POST) return { files: [], error: "file_too_large" };

  const prepared: PreparedFile[] = [];
  for (const file of files) {
    if (file.size > max) return { files: [], error: "file_too_large" };
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = sniffMime(buf);
    if (!mime) return { files: [], error: "unsupported_type" };
    prepared.push({
      buf,
      mime,
      fileName: file.name.slice(0, 200) || "attachment",
    });
  }
  return { files: prepared };
}

/** 附件落盘;中途失败把已写的清干净,不留孤儿文件 */
async function persistFiles(
  storage: StorageDriver,
  prepared: PreparedFile[],
  uploaderId: string,
): Promise<
  {
    uploaderId: string;
    storedName: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }[]
> {
  const storedNames: string[] = [];
  try {
    const rows: {
      uploaderId: string;
      storedName: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }[] = [];
    for (const f of prepared) {
      const stored = await storage.save(f.buf, extensionForMime(f.mime));
      storedNames.push(stored.storedName);
      rows.push({
        uploaderId,
        storedName: stored.storedName,
        fileName: f.fileName,
        mimeType: f.mime,
        sizeBytes: stored.sizeBytes,
      });
    }
    return rows;
  } catch (e) {
    await Promise.all(storedNames.map((n) => storage.remove(n)));
    throw e;
  }
}

/** 查被提及用户里真实存在且不是自己的 */
async function findMentionedUsers(
  content: string,
  selfId: string,
): Promise<{ id: string }[]> {
  const names = collectMentionCandidates([content]);
  if (!names.length) return [];
  return db.user.findMany({
    where: { username: { in: names }, id: { not: selfId } },
    select: { id: true },
  });
}

export async function createThreadAction(formData: FormData): Promise<string> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);

  const title = titleSchema.safeParse(formData.get("title"));
  const content = contentSchema.safeParse(formData.get("content"));
  const boardSlug = String(formData.get("boardSlug") ?? "");

  const board = await db.board.findUnique({ where: { slug: boardSlug } });
  if (!board) redirect("/?error=board_not_found");
  if (!title.success || !content.success) redirect(`/c/${board.slug}/new?error=invalid`);
  const _isStaffForCreate = isAdmin(user) || (await isBoardModerator(user.id, board.id));
  if ((board as unknown as { isHidden: boolean }).isHidden && !_isStaffForCreate) redirect("/?error=not_found");
  if ((board as unknown as { isLocked: boolean }).isLocked && !_isStaffForCreate) redirect(`/c/${board.slug}/new?error=board_locked`);

  // 主题分类(可选)
  const rawCategoryId = String(formData.get("categoryId") ?? "").trim();
  let categoryId: string | null = null;
  if (rawCategoryId) {
    const cat = await db.threadCategory.findFirst({
      where: { id: rawCategoryId, boardId: board.id },
      select: { id: true },
    });
    if (!cat) redirect(`/c/${board.slug}/new?error=invalid_category`);
    categoryId = cat.id;
  }

  const ip = await clientIp();
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response"), ip, "create_thread"))) {
    redirect(`/c/${board.slug}/new?error=captcha_failed`);
  }
  // 发帖限流:同一用户 / IP 每分钟 N 次
  if (
    !(await checkRateLimit(`thread:${user.id}`, THREAD_RATE_LIMIT, 60)) ||
    !(await checkRateLimit(`thread:ip:${ip}`, THREAD_RATE_LIMIT, 60))
  ) {
    redirect(`/c/${board.slug}/new?error=ratelimited`);
  }
  if (!(await checkRateLimit(`thread:${user.id}`, THREAD_RATE_LIMIT, 3600))) {
    redirect(`/c/${board.slug}/new?error=ratelimited`);
  }

  const { files: prepared, error: fileError } = await prepareFiles(formData);
  if (fileError) redirect(`/c/${board.slug}/new?error=${fileError}`);

  // 审核判定 A/B/C + 等级权限
  const approvalUser = await fetchApprovalUser(user.id);
  const approvalBoard = await fetchApprovalBoard(board.id);
  const { pending, reason: pendingReason } = approvalUser && approvalBoard ? await needsApproval(approvalUser, approvalBoard, title.data, content.data, _isStaffForCreate) : { pending: false, reason: null };
  const threadStatus = pending ? "pending" : "approved";
  const postStatus = pending ? "pending" : "approved";
  // 等级每日限额
  if (!_isStaffForCreate && approvalUser) {
    const { permsForPoints } = await import("@/lib/levels");
    const perms = permsForPoints(approvalUser.points);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayThreads = await db.thread.count({ where: { authorId: user.id, createdAt: { gte: today } } });
    if (todayThreads >= perms.dailyThreads) redirect(`/c/${board.slug}/new?error=daily_limit`);
    // 附件大小按等级
    const maxBytes = perms.maxUploadMB * 1024 * 1024;
    for (const f of prepared) {
      if (f.buf.length > maxBytes) redirect(`/c/${board.slug}/new?error=file_too_large`);
    }
  }

  // redirect 会抛 NEXT_REDIRECT,不能被 try 捕获,所以库操作和跳转分开
  const mentionedUsers = await findMentionedUsers(content.data, user.id);
  const storage = getStorage();
  const attachmentRows = await persistFiles(storage, prepared, user.id);
  let threadId: string;
  try {
    const thread = await db.$transaction(async (tx) => {
      const t = await tx.thread.create({
        data: {
          boardId: board.id,
          authorId: user.id,
          title: title.data,
          categoryId,
          status: threadStatus,
          posts: {
            create: {
              authorId: user.id,
              contentMd: content.data,
              status: postStatus,
              attachments: attachmentRows.length
                ? { create: attachmentRows }
                : undefined,
            },
          },
        },
      });
      if (!pending) {
        await tx.user.update({
          where: { id: user.id },
          data: { points: { increment: THREAD_POINTS } },
        });
      }
      if (!pending && mentionedUsers.length) {
        const notifyIds = planMentionNotifications({
          actorId: user.id,
          mentionedUserIds: mentionedUsers.map((u) => u.id),
        });
        if (notifyIds.length) {
          const rows = await filterRowsByPreferences(
            notifyIds.map((uid) => ({
              userId: uid,
              type: "mention",
              title: `${user.username} 在主题里提到了你`,
              body: excerptForNotify(content.data),
              link: `/t/${t.id}`,
            })),
            tx,
          );
          if (rows.length) await tx.notification.createMany({ data: rows });
        }
      }
      // 标签与投票：属主内容的一部分，随事务一起写入
      const tagNames = parseTagInput(formData.get("tags"));
      if (tagNames.length) await attachTags(tx, t.id, tagNames);
      const pollData = readPollForm(formData);
      if (pollData) await createPoll(tx as unknown as typeof db, t.id, pollData);

      if (pending) {
        // 通知版主/管理员待审
        const mods = await tx.boardModerator.findMany({ where: { boardId: board.id }, select: { userId: true } });
        const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
        const recipients = new Set<string>([...mods.map((m) => m.userId), ...admins.map((a) => a.id)]);
        recipients.delete(user.id);
        if (recipients.size) {
          await tx.notification.createMany({
            data: [...recipients].map((uid) => ({
              userId: uid,
              type: "pending",
              title: `新主题待审：${title.data.slice(0, 20)}`,
              body: pendingReason ?? "需审核",
              link: `/admin/pending`,
            })),
          });
        }
      }
      return t;
    });
    threadId = thread.id;
    logger.info("thread.create", { userId: user.id, threadId, board: board.slug, ip, status: threadStatus, reason: pendingReason });
    // 记录活跃 IP
    void db.user.update({ where: { id: user.id }, data: { lastActiveIp: ip, lastActiveAt: new Date() } }).catch(() => {});
    void db.userIpLog.create({ data: { userId: user.id, ip, action: "post" } }).catch(() => {});
    if (!pending) {
      revalidateTag("stats");
      revalidateTag("threads");
      revalidateTag("boards");
      revalidatePath("/");
      revalidatePath(`/c/${board.slug}`);
    } else {
      revalidateTag("pending");
    }
  } catch (e) {
    await Promise.all(attachmentRows.map((r) => storage.remove(r.storedName)));
    logger.error("thread.create_failed", { userId: user.id, error: String(e) });
    throw e;
  }
  return pending ? `/c/${board.slug}?pending=1` : `/t/${threadId}`;
}

export async function replyAction(formData: FormData): Promise<string> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);

  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      authorId: true,
      locked: true,
      title: true,
      board: { select: { id: true, slug: true, isHidden: true, isLocked: true } },
    },
  });
  if (!thread) redirect("/");
  if (!canReply(user, thread)) redirect(`/t/${thread.id}?error=locked`);
  const _isStaffReply = isAdmin(user) || (await isBoardModerator(user.id, thread.board.id));
  if ((thread.board as unknown as { isHidden: boolean }).isHidden && !_isStaffReply) redirect("/");
  if ((thread.board as unknown as { isLocked: boolean }).isLocked && !_isStaffReply) redirect(`/t/${thread.id}?error=board_locked`);

  const content = contentSchema.safeParse(formData.get("content"));
  if (!content.success) redirect(`/t/${thread.id}?error=invalid`);

  const ip = await clientIp();
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response"), ip, "create_reply"))) {
    redirect(`/t/${thread.id}?error=captcha_failed`);
  }
  // 回帖限流:同一用户 / IP 每分钟 N 次
  if (
    !(await checkRateLimit(`reply:${user.id}`, REPLY_RATE_LIMIT, 60)) ||
    !(await checkRateLimit(`reply:ip:${ip}`, REPLY_RATE_LIMIT, 60))
  ) {
    redirect(`/t/${thread.id}?error=ratelimited`);
  }
  if (!(await checkRateLimit(`reply:${user.id}`, REPLY_RATE_LIMIT, 3600))) {
    redirect(`/t/${thread.id}?error=ratelimited`);
  }

  const { files: prepared, error: fileError } = await prepareFiles(formData);
  if (fileError) redirect(`/t/${thread.id}?error=${fileError}`);

  // 通知对象:楼主(非自己)+ 被提及者(非自己,且与楼主去重),一人一条 + 收藏订阅
  const mentionRows = await findMentionedUsers(content.data, user.id);
  const notifyPlan = planReplyNotifications({
    actorId: user.id,
    threadAuthorId: thread.authorId,
    mentionedUserIds: mentionRows.map((u) => u.id),
  });
  const favRows = await db.favorite.findMany({
    where: { threadId: thread.id, userId: { not: user.id } },
    select: { userId: true },
  });
  const favoriteNotifyIds = planFavoriteReplyNotifications({
    actorId: user.id,
    subscriberIds: favRows.map((r) => r.userId),
    alreadyNotifiedIds: new Set(notifyPlan.map((n) => n.userId)),
  });
  const replyHref = thread.board.slug === "novel" && user.id !== thread.authorId ? `/t/${thread.id}?filter=discussion` : `/t/${thread.id}`;

  // 屏蔽：不给「屏蔽了我」的人发通知（对方看不到你，也别打扰对方）
  const blockers = await blockersOf(user.id, [...notifyPlan.map((n) => n.userId), ...favoriteNotifyIds]);
  const visiblePlan = notifyPlan.filter((n) => !blockers.has(n.userId));
  const visibleFavIds = favoriteNotifyIds.filter((uid) => !blockers.has(uid));

  const approvalUserReply = await fetchApprovalUser(user.id);
  const approvalBoardReply = await fetchApprovalBoard(thread.board.id);
  const { pending: pendingReply, reason: pendingReasonReply } = approvalUserReply && approvalBoardReply ? await needsApproval(approvalUserReply, approvalBoardReply, "", content.data, _isStaffReply) : { pending: false, reason: null };
  const postStatusReply = pendingReply ? "pending" : "approved";
  if (!_isStaffReply && approvalUserReply) {
    const { permsForPoints } = await import("@/lib/levels");
    const perms = permsForPoints(approvalUserReply.points);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayReplies = await db.post.count({ where: { authorId: user.id, createdAt: { gte: today } } });
    if (todayReplies >= perms.dailyReplies) redirect(`/t/${thread.id}?error=daily_limit`);
    const maxBytes = perms.maxUploadMB * 1024 * 1024;
    for (const f of prepared) { if (f.buf.length > maxBytes) redirect(`/t/${thread.id}?error=file_too_large`); }
  }

  const storage = getStorage();
  const attachmentRows = await persistFiles(storage, prepared, user.id);
  try {
    await db.$transaction(async (tx) => {
      await tx.post.create({
        data: {
          threadId: thread.id,
          authorId: user.id,
          contentMd: content.data,
          status: postStatusReply,
          attachments: attachmentRows.length
            ? { create: attachmentRows }
            : undefined,
        },
      });
      if (!pendingReply) {
        await tx.thread.update({
          where: { id: thread.id },
          data: { lastPostAt: new Date() },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { points: { increment: REPLY_POINTS } },
        });
      }
      if (!pendingReply && visiblePlan.length) {
        const rows = await filterRowsByPreferences(
          visiblePlan.map(({ userId: uid, kind: type }) => ({
            userId: uid,
            type,
            title:
              type === "reply"
                ? `${user.username} 回复了你的主题`
                : `${user.username} 在回复里提到了你`,
            body: excerptForNotify(content.data),
            link: replyHref,
          })),
          tx,
        );
        if (rows.length) await tx.notification.createMany({ data: rows });
      }
      if (!pendingReply && visibleFavIds.length) {
        const rows = await filterRowsByPreferences(
          visibleFavIds.map((uid) => ({
            userId: uid,
            type: "favorite",
            title: `${user.username} 回复了你收藏的主题`,
            body: excerptForNotify(content.data),
            link: replyHref,
          })),
          tx,
        );
        if (rows.length) await tx.notification.createMany({ data: rows });
      }
      if (!pendingReply && visiblePlan.length) {
        // 邮件提醒：不在线的人才发，10 分钟一人一封
        for (const item of visiblePlan.slice(0, 3)) {
          after(() =>
            maybeEmailNotify({
              userId: item.userId,
              subject: item.kind === "reply" ? `${user.username} 回复了你的主题` : `${user.username} 在回复里提到了你`,
              body: `${user.username} 在《${thread.title.slice(0, 30)}》里${item.kind === "reply" ? "回复了你" : "提到了你"}：${excerptForNotify(content.data)}`,
              link: replyHref,
            }),
          );
        }
      }
      if (pendingReply) {
        const mods = await tx.boardModerator.findMany({ where: { boardId: thread.board.id }, select: { userId: true } });
        const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
        const recipients = new Set<string>([...mods.map((m) => m.userId), ...admins.map((a) => a.id)]);
        recipients.delete(user.id);
        if (recipients.size) {
          await tx.notification.createMany({
            data: [...recipients].map((uid) => ({
              userId: uid,
              type: "pending",
              title: `新回帖待审：${content.data.slice(0, 20)}`,
              body: pendingReasonReply ?? "需审核",
              link: `/admin/pending`,
            })),
          });
        }
      }
    });
    logger.info("post.reply", { userId: user.id, threadId, ip, status: postStatusReply });
    void db.user.update({ where: { id: user.id }, data: { lastActiveIp: ip, lastActiveAt: new Date() } }).catch(() => {});
    void db.userIpLog.create({ data: { userId: user.id, ip, action: "reply" } }).catch(() => {});
    if (!pendingReply) {
      revalidateTag("stats");
      revalidateTag("threads");
      revalidatePath(`/t/${thread.id}`);
      revalidatePath("/");
    } else {
      revalidateTag("pending");
    }
  } catch (e) {
    await Promise.all(attachmentRows.map((r) => storage.remove(r.storedName)));
    logger.error("post.reply_failed", { userId: user.id, threadId, error: String(e) });
    throw e;
  }
  return pendingReply
    ? `${replyHref}${replyHref.includes("?") ? "&" : "?"}pending=1`
    : replyHref;
}

/**
 * 编辑楼层:本人且主题未锁。写 PostEdit 历史,更新内容和线程 lastPostAt。
 * 附件不可改动(要换附件就删了重发),只改 Markdown 原文。
 */
export async function editPostAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);

  const postId = String(formData.get("postId") ?? "");
  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      contentMd: true,
      threadId: true,
      createdAt: true,
      thread: { select: { locked: true, board: { select: { slug: true } } } },
    },
  });
  if (!post) redirect("/");

  if (!canEditPost(user, post, { threadLocked: post.thread.locked })) {
    redirect(`/t/${post.threadId}?error=forbidden`);
  }

  const content = contentSchema.safeParse(formData.get("content"));
  if (!content.success) redirect(`/t/${post.threadId}?error=invalid`);
  if (await containsSensitive(content.data)) {
    logger.info("moderation.blocked_sensitive", { userId: user.id, action: "editPost", postId, ip: await clientIp() });
    redirect(`/t/${post.threadId}?error=sensitive`);
  }

  // 编辑限流:同一用户 / IP 每分钟 10 次
  const ip = await clientIp();
  if (
    !(await checkRateLimit(`edit:${user.id}`, EDIT_RATE_LIMIT, 60)) ||
    !(await checkRateLimit(`edit:ip:${ip}`, EDIT_RATE_LIMIT, 60))
  ) {
    redirect(`/t/${post.threadId}?error=ratelimited`);
  }

  // 5 分钟内免留痕：发帖后 5 分钟内的编辑不写入 PostEdit 历史（视为 minor）
  const isGracePeriod = Date.now() - new Date(post.createdAt).getTime() < 5 * 60 * 1000;

  try {
    await db.$transaction(async (tx) => {
      if (!isGracePeriod) {
        await tx.postEdit.create({
          data: {
            postId: post.id,
            editorId: user.id,
            oldContentMd: post.contentMd,
            newContentMd: content.data,
          },
        });
      }
      await tx.post.update({
        where: { id: post.id },
        data: { contentMd: content.data },
      });
      await tx.thread.update({
        where: { id: post.threadId },
        data: { lastPostAt: new Date() },
      });
    });
    logger.info("post.edit", { userId: user.id, postId, grace: isGracePeriod });
    revalidateTag("threads");
    revalidatePath(`/t/${post.threadId}`);
  } catch (e) {
    logger.error("post.edit_failed", { userId: user.id, postId, error: String(e) });
    throw e;
  }
  redirect(`/t/${post.threadId}`);
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const postId = String(formData.get("postId") ?? "");
  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      threadId: true,
      thread: {
        select: { locked: true, board: { select: { slug: true, id: true } } },
      },
    },
  });
  if (!post) redirect("/");

  const first = await db.post.findFirst({
    where: { threadId: post.threadId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const isFirstPost = first?.id === post.id;

  const isStaff = isAdmin(user) || (await isBoardModerator(user.id, post.thread.board.id));
  if (
    !canDeletePost(user, post, {
      isFirstPost,
      threadLocked: post.thread.locked,
      staff: isStaff,
    })
  ) {
    redirect(`/t/${post.threadId}?error=forbidden`);
  }

  if (isFirstPost) {
    // 作者自删整帖：软删除进回收站（30 天内可联系管理员恢复）
    await softDeleteThread(post.threadId, { actorId: user.id, reason: "作者自行删除" });
    // 自己删自己的内容不必再发通知
    await db.notification.deleteMany({ where: { userId: user.id, type: "moderation" } }).catch(() => {});
    logger.info("thread.delete_by_author", { userId: user.id, threadId: post.threadId });
    revalidateTag("stats");
    revalidateTag("threads");
    revalidateTag("boards");
    revalidatePath("/");
    revalidatePath(`/c/${post.thread.board.slug}`);
    redirect(`/c/${post.thread.board.slug}`);
  } else {
    // 自删回复：同样进回收站
    await softDeletePost(post.id, { actorId: user.id, reason: "作者自行删除" });
    await db.notification.deleteMany({ where: { userId: user.id, type: "moderation" } }).catch(() => {});
    logger.info("post.delete", { userId: user.id, postId });
    revalidateTag("stats");
    revalidateTag("threads");
    revalidatePath(`/t/${post.threadId}`);
    redirect(`/t/${post.threadId}`);
  }
}

export async function togglePinAction(formData: FormData): Promise<string> {
  const user = await getCurrentUser();
  if (!user) return "/";

  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, pinned: true, board: { select: { slug: true, id: true } } },
  });
  if (!thread) return "/";
  const isStaff = isAdmin(user) || (await isBoardModerator(user.id, thread.board.id));
  if (!isStaff) return "/";

  await db.thread.update({
    where: { id: thread.id },
    data: { pinned: !thread.pinned },
  });
  logger.info("thread.toggle_pin", { userId: user.id, threadId });
  revalidateTag("threads");
  revalidatePath(`/t/${thread.id}`);
  revalidatePath("/");
  return `/t/${thread.id}`;
}

export async function toggleLockAction(formData: FormData): Promise<string> {
  const user = await getCurrentUser();
  if (!user) return "/";

  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, locked: true, board: { select: { id: true } } },
  });
  if (!thread) return "/";
  const isStaff = isAdmin(user) || (await isBoardModerator(user.id, thread.board.id));
  if (!isStaff) return "/";

  await db.thread.update({
    where: { id: thread.id },
    data: { locked: !thread.locked },
  });
  logger.info("thread.toggle_lock", { userId: user.id, threadId });
  revalidateTag("threads");
  revalidatePath(`/t/${thread.id}`);
  return `/t/${thread.id}`;
}

export async function toggleDigestAction(formData: FormData): Promise<string> {
  const user = await getCurrentUser();
  if (!user) return "/";

  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, title: true, digested: true, authorId: true, board: { select: { id: true } } },
  });
  if (!thread) return "/";
  if (!canModerateBoard(user, await isBoardModerator(user.id, thread.board.id))) return "/";

  await db.thread.update({
    where: { id: thread.id },
    data: { digested: !thread.digested },
  });
  // 刚被加精才打扰作者,取消加精静默
  if (!thread.digested && thread.authorId !== user.id) {
    const rows = await filterRowsByPreferences([
      {
        userId: thread.authorId,
        type: "digest",
        title: `你的主题「${thread.title.slice(0, 30)}」被加精了`,
        link: `/t/${thread.id}`,
      },
    ]);
    if (rows.length) await db.notification.createMany({ data: rows }).catch(() => {});
  }
  await db.auditLog
    .create({ data: { actorId: user.id, action: "toggle_digest", targetType: "thread", targetId: thread.id } })
    .catch(() => {});
  logger.info("thread.toggle_digest", { userId: user.id, threadId });
  revalidateTag("threads");
  revalidatePath(`/t/${thread.id}`);
  revalidatePath("/");
  return `/t/${thread.id}`;
}

export async function toggleGlobalPinAction(formData: FormData): Promise<string> {
  const user = await getCurrentUser();
  if (!user) return "/";

  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, globalPinned: true },
  });
  if (!thread) return "/";
  if (!canGlobalPin(user)) return "/";

  await db.thread.update({
    where: { id: thread.id },
    data: { globalPinned: !thread.globalPinned },
  });
  await db.auditLog
    .create({ data: { actorId: user.id, action: "toggle_global_pin", targetType: "thread", targetId: thread.id } })
    .catch(() => {});
  logger.info("thread.toggle_global_pin", { userId: user.id, threadId });
  revalidateTag("threads");
  revalidatePath(`/t/${thread.id}`);
  revalidatePath("/");
  return `/t/${thread.id}`;
}

export async function moveThreadAction(formData: FormData): Promise<string> {
  const user = await getCurrentUser();
  if (!user) return "/";

  const threadId = String(formData.get("threadId") ?? "");
  const targetSlug = String(formData.get("targetBoardSlug") ?? "").trim().toLowerCase();
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, title: true, board: { select: { id: true, slug: true } } },
  });
  const target = targetSlug
    ? await db.board.findUnique({
        where: { slug: targetSlug },
        select: { id: true, slug: true, isLocked: true },
      })
    : null;
  if (!thread || !target) return `/t/${threadId}?error=not_found`;
  if (target.id === thread.board.id) return `/t/${thread.id}`;
  // 锁定的版块只有管理员能往里搬
  if (target.isLocked && !isAdmin(user)) return `/t/${thread.id}?error=board_locked`;
  const allowed = canMoveThread(
    user,
    await isBoardModerator(user.id, thread.board.id),
    await isBoardModerator(user.id, target.id),
  );
  if (!allowed) return `/t/${thread.id}?error=forbidden`;

  await db.thread.update({
    where: { id: thread.id },
    // 分类是按版块定义的,跨版块移动时清空,避免挂到别的版块的分类下
    data: { boardId: target.id, categoryId: null },
  });
  await db.auditLog
    .create({
      data: {
        actorId: user.id,
        action: "move_thread",
        targetType: "thread",
        targetId: thread.id,
        detail: `${thread.board.slug} -> ${target.slug}`,
      },
    })
    .catch(() => {});
  logger.info("thread.move", { userId: user.id, threadId, from: thread.board.slug, to: target.slug });
  revalidateTag("threads");
  revalidateTag("boards");
  revalidatePath(`/t/${thread.id}`);
  revalidatePath("/");
  return `/t/${thread.id}`;
}
