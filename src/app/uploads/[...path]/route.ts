import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

/**
 * 开发环境和"没有前置反代"场景下的附件出口。
 * 生产环境 Caddy 会直接在 /uploads/* 上伺服文件,根本到不了这里。
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

  const root = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
  const full = path.resolve(root, storedName);
  if (!full.startsWith(root + path.sep)) {
    return new Response("forbidden", { status: 403 });
  }

  try {
    const data = await readFile(full);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": att.mimeType,
        "Content-Length": String(att.sizeBytes),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
