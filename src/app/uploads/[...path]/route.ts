import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

/**
 * 附件出口（开发环境直接由 Next 伺服；生产 Caddy 会在 /uploads/* 上静态伺服，请求通常不到这里）。
 * 兼容 local 与 s3：优先走 storage 驱动的 read（S3 必备），本地再 fallback 到磁盘读取。
 *
 * 可见性与主题一致，避免「帖子已删/待审/隐藏，附件 URL 还能直链」：
 * - 已删除：仅作者与 staff 可见，其余 404
 * - 待审：仅作者与 staff 可见，其余 404
 * - 隐藏版块：仅 staff 可见，其余 404
 * 注意：生产 Caddy 直接读盘时不经过本检查（见 Caddyfile 注释），附件 URL 仍应视为
 * bearer token（128bit 随机，不可枚举）；本检查覆盖 S3/直连 Next 场景与纵深防御。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  // storedName 只可能是 "YYYY-MM-DD/十六进制.ext",其他一律 404
  const valid =
    segments?.length === 2 &&
    /^\d{4}-\d{2}-\d{2}$/.test(segments[0]) &&
    /^[a-f0-9]{32}\.[a-z0-9]+$/i.test(segments[1]);
  if (!valid) return new Response("not found", { status: 404 });

  const storedName = segments.join("/");
  const att = await db.attachment.findUnique({
    where: { storedName },
    select: {
      storedName: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      post: {
        select: {
          authorId: true,
          status: true,
          thread: {
            select: {
              authorId: true,
              status: true,
              boardId: true,
              board: { select: { isHidden: true } },
            },
          },
        },
      },
    },
  });
  if (!att) return new Response("not found", { status: 404 });

  const threadStatus = att.post.thread.status;
  const postStatus = att.post.status;
  const hidden = att.post.thread.board.isHidden;
  const gone = threadStatus === "deleted" || postStatus === "deleted";
  const pending = threadStatus === "pending" || postStatus === "pending";
  if (gone || pending || hidden) {
    const viewer = await getCurrentUser().catch(() => null);
    const isAuthor =
      !!viewer && (viewer.id === att.post.authorId || viewer.id === att.post.thread.authorId);
    let isStaff = viewer?.role === "ADMIN";
    if (!isStaff && viewer) {
      const mod = await db.boardModerator
        .findUnique({
          where: { boardId_userId: { boardId: att.post.thread.boardId, userId: viewer.id } },
          select: { id: true },
        })
        .catch(() => null);
      isStaff = !!mod;
    }
    if (gone && !isAuthor && !isStaff) return new Response("not found", { status: 404 });
    if (pending && !isAuthor && !isStaff) return new Response("not found", { status: 404 });
    if (hidden && !isStaff) return new Response("not found", { status: 404 });
  }

  const storage = getStorage();
  let data: Buffer | null = null;

  // S3 优先通过驱动读取，成功则直接返回
  if (storage.read) {
    try {
      data = await storage.read(storedName);
    } catch {}
  }
  // 本地 fallback：直接读盘（兼容旧逻辑与未迁移附件）
  if (!data) {
    const root = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
    const full = path.resolve(root, storedName);
    if (!full.startsWith(root + path.sep)) {
      return new Response("forbidden", { status: 403 });
    }
    try {
      data = await readFile(full);
    } catch {
      return new Response("not found", { status: 404 });
    }
  }

  // 非图片/非 PDF 一律 attachment 下载，避免浏览器内渲染文本类附件
  const inline = att.mimeType.startsWith("image/") || att.mimeType === "application/pdf";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Length": String(att.sizeBytes),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
