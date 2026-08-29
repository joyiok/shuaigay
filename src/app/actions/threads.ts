"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  canDeletePost,
  canReply,
  isAdmin,
} from "@/lib/permissions";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  extensionForMime,
  getStorage,
  maxUploadBytes,
  MAX_FILES_PER_POST,
  type StorageDriver,
} from "@/lib/storage";
import { sniffMime } from "@/lib/filetype";

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

export async function createThreadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const title = titleSchema.safeParse(formData.get("title"));
  const content = contentSchema.safeParse(formData.get("content"));
  const boardSlug = String(formData.get("boardSlug") ?? "");
  if (!title.success || !content.success) redirect("/?error=invalid");

  const board = await db.board.findUnique({ where: { slug: boardSlug } });
  if (!board) redirect("/?error=board_not_found");

  if (!(await checkRateLimit(`thread:${user.id}`, 5, 3600))) {
    redirect(`/c/${board.slug}?error=ratelimited`);
  }

  const { files: prepared, error: fileError } = await prepareFiles(formData);
  if (fileError) redirect(`/c/${board.slug}/new?error=${fileError}`);

  const storage = getStorage();
  const attachmentRows = prepared.length
    ? await persistFiles(storage, prepared, user.id)
    : [];

  // redirect 会抛 NEXT_REDIRECT,不能被 try 捕获,所以库操作和跳转分开
  let threadId: string;
  try {
    const thread = await db.thread.create({
      data: {
        boardId: board.id,
        authorId: user.id,
        title: title.data,
        posts: {
          create: {
            authorId: user.id,
            contentMd: content.data,
            attachments: attachmentRows.length
              ? { create: attachmentRows }
              : undefined,
          },
        },
      },
    });
    threadId = thread.id;
  } catch (e) {
    await Promise.all(attachmentRows.map((r) => storage.remove(r.storedName)));
    throw e;
  }
  redirect(`/t/${threadId}`);
}

export async function replyAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      authorId: true,
      locked: true,
      board: { select: { slug: true } },
    },
  });
  if (!thread) redirect("/");
  if (!canReply(user, thread)) redirect(`/t/${thread.id}?error=locked`);

  const content = contentSchema.safeParse(formData.get("content"));
  if (!content.success) redirect(`/t/${thread.id}?error=invalid`);

  if (!(await checkRateLimit(`reply:${user.id}`, 30, 3600))) {
    redirect(`/t/${thread.id}?error=ratelimited`);
  }

  const { files: prepared, error: fileError } = await prepareFiles(formData);
  if (fileError) redirect(`/t/${thread.id}?error=${fileError}`);

  const storage = getStorage();
  const attachmentRows = prepared.length
    ? await persistFiles(storage, prepared, user.id)
    : [];

  try {
    await db.$transaction([
      db.post.create({
        data: {
          threadId: thread.id,
          authorId: user.id,
          contentMd: content.data,
          attachments: attachmentRows.length
            ? { create: attachmentRows }
            : undefined,
        },
      }),
      db.thread.update({
        where: { id: thread.id },
        data: { lastPostAt: new Date() },
      }),
    ]);
  } catch (e) {
    await Promise.all(attachmentRows.map((r) => storage.remove(r.storedName)));
    throw e;
  }
  redirect(`/t/${thread.id}`);
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
        select: { locked: true, board: { select: { slug: true } } },
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

  if (
    !canDeletePost(user, post, {
      isFirstPost,
      threadLocked: post.thread.locked,
    })
  ) {
    redirect(`/t/${post.threadId}?error=forbidden`);
  }

  const storage = getStorage();
  if (isFirstPost) {
    // 删首帖 = 删整个主题,附件行级联删除,文件手工清理
    const all = await db.attachment.findMany({
      where: { post: { threadId: post.threadId } },
      select: { storedName: true },
    });
    await db.thread.delete({ where: { id: post.threadId } });
    await Promise.all(all.map((a) => storage.remove(a.storedName)));
    redirect(`/c/${post.thread.board.slug}`);
  } else {
    const atts = await db.attachment.findMany({
      where: { postId: post.id },
      select: { storedName: true },
    });
    await db.post.delete({ where: { id: post.id } });
    await Promise.all(atts.map((a) => storage.remove(a.storedName)));
    redirect(`/t/${post.threadId}`);
  }
}

export async function togglePinAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) redirect("/");

  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, pinned: true, board: { select: { slug: true } } },
  });
  if (!thread) redirect("/");

  await db.thread.update({
    where: { id: thread.id },
    data: { pinned: !thread.pinned },
  });
  redirect(`/t/${thread.id}`);
}

export async function toggleLockAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) redirect("/");

  const threadId = String(formData.get("threadId") ?? "");
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, locked: true },
  });
  if (!thread) redirect("/");

  await db.thread.update({
    where: { id: thread.id },
    data: { locked: !thread.locked },
  });
  redirect(`/t/${thread.id}`);
}
