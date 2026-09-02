"use server";

import { redirect } from "next/navigation";
import { revalidateTag, revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  canDeletePost,
  canEditPost,
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
import { logger } from "@/lib/logger";

const titleSchema = z.string().trim().min(1).max(120);
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

export async function createThreadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await assertNotBanned(user.id);

  const title = titleSchema.safeParse(formData.get("title"));
  const content = contentSchema.safeParse(formData.get("content"));
  const boardSlug = String(formData.get("boardSlug") ?? "");
  if (!title.success || !content.success) redirect("/?error=invalid");

  const board = await db.board.findUnique({ where: { slug: boardSlug } });
  if (!board) redirect("/?error=board_not_found");
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
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response"), ip))) {
    redirect(`/c/${board.slug}/new?error=captcha_failed`);
  }
  // 发帖限流:同一用户 / IP 每分钟 N 次
  if (
    !(await checkRateLimit(`thread:${user.id}`, THREAD_RATE_LIMIT, 60)) ||
    !(await checkRateLimit(`thread:ip:${ip}`, THREAD_RATE_LIMIT, 60))
  ) {
    redirect(`/c/${board.slug}?error=ratelimited`);
  }
  if (!(await checkRateLimit(`thread:${user.id}`, THREAD_RATE_LIMIT, 3600))) {
    redirect(`/c/${board.slug}?error=ratelimited`);
  }

  const { files: prepared, error: fileError } = await prepareFiles(formData);
  if (fileError) redirect(`/c/${board.slug}/new?error=${fileError}`);

  const storage = getStorage();
  const attachmentRows = prepared.length
    ? await persistFiles(storage, prepared, user.id)
    : [];

  // 审核判定 A/B/C
  const approvalUser = await fetchApprovalUser(user.id);
  const approvalBoard = await fetchApprovalBoard(board.id);
  const { pending, reason: pendingReason } = approvalUser && approvalBoard ? await needsApproval(approvalUser, approvalBoard, title.data, content.data, _isStaffForCreate) : { pending: false, reason: null };
  const threadStatus = pending ? "pending" : "approved";
  const postStatus = pending ? "pending" : "approved";

  // redirect 会抛 NEXT_REDIRECT,不能被 try 捕获,所以库操作和跳转分开
  const mentionedUsers = await findMentionedUsers(content.data, user.id);
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
          await tx.notification.createMany({
            data: notifyIds.map((uid) => ({
              userId: uid,
              type: "mention",
              title: `${user.username} 在主题里提到了你`,
              body: excerptForNotify(content.data),
              link: `/t/${t.id}`,
            })),
          });
        }
      }
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
  if (pending) redirect(`/c/${board.slug}?pending=1`);
  redirect(`/t/${threadId}`);
}

export async function replyAction(formData: FormData): Promise<void> {
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
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response"), ip))) {
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

  const storage = getStorage();
  const attachmentRows = prepared.length
    ? await persistFiles(storage, prepared, user.id)
    : [];

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

  const approvalUserReply = await fetchApprovalUser(user.id);
  const approvalBoardReply = await fetchApprovalBoard(thread.board.id);
  const { pending: pendingReply, reason: pendingReasonReply } = approvalUserReply && approvalBoardReply ? await needsApproval(approvalUserReply, approvalBoardReply, "", content.data, _isStaffReply) : { pending: false, reason: null };
  const postStatusReply = pendingReply ? "pending" : "approved";

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
      if (!pendingReply && notifyPlan.length) {
        await tx.notification.createMany({
          data: notifyPlan.map(({ userId: uid, kind: type }) => ({
            userId: uid,
            type,
            title:
              type === "reply"
                ? `${user.username} 回复了你的主题`
                : `${user.username} 在回复里提到了你`,
            body: excerptForNotify(content.data),
            link: `/t/${thread.id}`,
          })),
        });
      }
      if (!pendingReply && favoriteNotifyIds.length) {
        await tx.notification.createMany({
          data: favoriteNotifyIds.map((uid) => ({
            userId: uid,
            type: "favorite",
            title: `${user.username} 回复了你收藏的主题`,
            body: excerptForNotify(content.data),
            link: `/t/${thread.id}`,
          })),
        });
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
  if (pendingReply) redirect(`/t/${thread.id}?pending=1`);
  redirect(`/t/${thread.id}`);
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

  const storage = getStorage();
  if (isFirstPost) {
    const all = await db.attachment.findMany({
      where: { post: { threadId: post.threadId } },
      select: { storedName: true },
    });
    await db.thread.delete({ where: { id: post.threadId } });
    await Promise.all(all.map((a) => storage.remove(a.storedName)));
    logger.info("thread.delete_by_author", { userId: user.id, threadId: post.threadId });
    revalidateTag("stats");
    revalidateTag("threads");
    revalidateTag("boards");
    revalidatePath("/");
    revalidatePath(`/c/${post.thread.board.slug}`);
    redirect(`/c/${post.thread.board.slug}`);
  } else {
    const atts = await db.attachment.findMany({
      where: { postId: post.id },
      select: { storedName: true },
    });
    await db.post.delete({ where: { id: post.id } });
    await Promise.all(atts.map((a) => storage.remove(a.storedName)));
    logger.info("post.delete", { userId: user.id, postId });
    revalidateTag("stats");
    revalidateTag("threads");
    revalidatePath(`/t/${post.threadId}`);
    redirect(`/t/${post.threadId}`);
  }
}

export async function togglePinAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, pinned: true, board: { select: { slug: true, id: true } } },
  });
  if (!thread) redirect("/");
  const isStaff = isAdmin(user) || (await isBoardModerator(user.id, thread.board.id));
  if (!isStaff) redirect("/");

  await db.thread.update({
    where: { id: thread.id },
    data: { pinned: !thread.pinned },
  });
  logger.info("thread.toggle_pin", { userId: user.id, threadId });
  revalidateTag("threads");
  revalidatePath(`/t/${thread.id}`);
  revalidatePath("/");
  redirect(`/t/${thread.id}`);
}

export async function toggleLockAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, locked: true, board: { select: { id: true } } },
  });
  if (!thread) redirect("/");
  const isStaff = isAdmin(user) || (await isBoardModerator(user.id, thread.board.id));
  if (!isStaff) redirect("/");

  await db.thread.update({
    where: { id: thread.id },
    data: { locked: !thread.locked },
  });
  logger.info("thread.toggle_lock", { userId: user.id, threadId });
  revalidateTag("threads");
  revalidatePath(`/t/${thread.id}`);
  redirect(`/t/${thread.id}`);
}
