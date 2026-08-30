import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sniffMime } from "@/lib/filetype";
import { extensionForMime, getStorage, MAX_AVATAR_BYTES, avatarUrlForStoredName } from "@/lib/storage";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("avatar") ?? formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "请选择图片" }, { status: 400 });
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "头像需小于 2MB" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || !ALLOWED_MIMES.has(mime)) {
    return NextResponse.json({ error: "仅支持 JPG/PNG/GIF/WEBP" }, { status: 400 });
  }

  const ext = extensionForMime(mime);
  const storage = getStorage();
  let stored: { storedName: string; sizeBytes: number };
  try {
    stored = await storage.save(buf, ext);
  } catch (e) {
    console.error("[avatar] save failed", e);
    return NextResponse.json({ error: "存储失败" }, { status: 500 });
  }

  // 记录旧头像，更新失败时清理新文件
  const prev = await db.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
  try {
    await db.user.update({ where: { id: user.id }, data: { avatarUrl: stored.storedName } });
  } catch (e) {
    await storage.remove(stored.storedName).catch(() => {});
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }

  // 清理旧头像文件（不同存储时可能残留，忽略错误）
  if (prev?.avatarUrl && prev.avatarUrl !== stored.storedName) {
    await storage.remove(prev.avatarUrl).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    avatarUrl: stored.storedName,
    url: avatarUrlForStoredName(stored.storedName),
  });
}

/**
 * 头像读取：GET /api/avatar?file=YYYY-MM-DD/hex.jpg
 * 兼容本地存储和 S3，需校验 storedName 格式并从存储后端读取。
 */
export async function GET(req: NextRequest): Promise<Response> {
  const file = req.nextUrl.searchParams.get("file")?.trim();
  if (!file) return new Response("missing file", { status: 400 });

  // 严格校验 storedName 格式，防止路径穿越： YYYY-MM-DD/hex.ext
  if (!/^\d{4}-\d{2}-\d{2}\/[a-f0-9]{32}\.[a-z0-9]+$/i.test(file)) {
    return new Response("not found", { status: 404 });
  }

  // 简单校验：确实是某个用户的头像才放行，避免当任意附件下载器
  const owner = await db.user.findFirst({ where: { avatarUrl: file }, select: { id: true } });
  if (!owner) return new Response("not found", { status: 404 });

  const storage = getStorage();

  // 优先用 driver 的 read（S3 场景必备），本地 fallback 到 storage.read
  let data: Buffer | null = null;
  if (storage.read) {
    data = await storage.read(file);
  }
  if (!data) {
    // 本地未命中时尝试直接读盘（兼容旧逻辑）
    try {
      const path = await import("node:path");
      const { readFile } = await import("node:fs/promises");
      const root = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
      const full = path.resolve(root, file);
      if (!full.startsWith(root + path.sep)) return new Response("forbidden", { status: 403 });
      data = await readFile(full);
    } catch {
      return new Response("not found", { status: 404 });
    }
  }
  if (!data) return new Response("not found", { status: 404 });

  // 根据魔数推断 mime，兜底为 octet-stream
  const sniffed = sniffMime(data) ?? "application/octet-stream";
  // 仅允许图片类，避免意外暴露非图片
  if (!sniffed.startsWith("image/")) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": sniffed,
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
