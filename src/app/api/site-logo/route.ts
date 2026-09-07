import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sniffMime } from "@/lib/filetype";
import { getStorage } from "@/lib/storage";
import { siteLogoUrlForStoredName, storedNameFromSiteLogoUrl } from "@/lib/site";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function GET(req: NextRequest): Promise<Response> {
  const file = req.nextUrl.searchParams.get("file")?.trim();
  const canonical = file ? siteLogoUrlForStoredName(file) : "";
  if (!file || !storedNameFromSiteLogoUrl(canonical)) return new Response("not found", { status: 404 });

  const setting = await db.siteSetting.findUnique({ where: { id: "site" }, select: { logoUrl: true } });
  if (setting?.logoUrl !== canonical) return new Response("not found", { status: 404 });

  const storage = getStorage();
  let data: Buffer | null = storage.read ? await storage.read(file) : null;
  if (!data) {
    const root = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
    const full = path.resolve(root, file);
    if (!full.startsWith(root + path.sep)) return new Response("forbidden", { status: 403 });
    try {
      data = await readFile(full);
    } catch {
      return new Response("not found", { status: 404 });
    }
  }

  const mime = sniffMime(data);
  if (!mime || !ALLOWED_MIMES.has(mime)) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(data.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
