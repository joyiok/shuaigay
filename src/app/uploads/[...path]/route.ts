import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";

/**
 * 附件出口（开发环境直接由 Next 伺服；生产 Caddy 会在 /uploads/* 上静态伺服，请求通常不到这里）。
 * 兼容 local 与 s3：优先走 storage 驱动的 read（S3 必备），本地再 fallback 到磁盘读取。
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
  const att = await db.attachment.findUnique({ where: { storedName } });
  if (!att) return new Response("not found", { status: 404 });

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

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Length": String(att.sizeBytes),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
