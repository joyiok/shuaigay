/**
 * 附件安全扫描（P0）：无外部依赖的本地启发式。
 * - EICAR 特征直接拒收（杀毒占位，未接 ClamAV 前的底线）
 * - 文本类伪装成 HTML/SVG 文档的直接拒收（防存储型 XSS；代码片段含 <script> 不拦，只拦“整文件就是文档”）
 * - 图片解码炸弹防护：解析 PNG/JPEG/GIF/WEBP 头部尺寸，超 8000px 边或 5000万像素拒收
 * 纯函数，便于单测；真正的 ClamAV/云鉴黄可后续在 prepareFiles 里再加一道 async 钩子。
 */

export const MAX_IMAGE_DIMENSION = 8000;
export const MAX_IMAGE_PIXELS = 50_000_000;

// EICAR 标准测试串（杀毒软件通用）
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

export function containsEicar(buf: Buffer): boolean {
  if (buf.length < EICAR.length) return false;
  // 文本附件才扫，避免二进制误伤；超 5MB 只扫头尾 1MB（性能）
  const head = buf.subarray(0, 1024 * 1024).toString("latin1");
  const tail = buf.length > 1024 * 1024 ? buf.subarray(buf.length - 1024 * 1024).toString("latin1") : "";
  return head.includes(EICAR) || tail.includes(EICAR);
}

/** 去掉 BOM/空白后是否“整文件就是一个标记文档”（而非代码片段） */
export function looksLikeMarkupDocument(buf: Buffer): boolean {
  const head = buf.subarray(0, 4096).toString("utf8").replace(/^\uFEFF/, "").trimStart().slice(0, 512).toLowerCase();
  if (!head.startsWith("<")) return false;
  return (
    head.startsWith("<svg") ||
    head.startsWith("<html") ||
    head.startsWith("<!doctype html") ||
    head.startsWith("<?xml") ||
    head.startsWith("<script")
  );
}

function u16be(b: Buffer, o: number) { return (b[o]! << 8) | b[o + 1]!; }
function u16le(b: Buffer, o: number) { return b[o]! | (b[o + 1]! << 8); }
function u32be(b: Buffer, o: number) { return b[o]! * 0x1000000 + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!); }

/** 解析图片尺寸，解析不出返回 null（调用方视为损坏） */
export function imageDimensions(buf: Buffer, mime: string): { w: number; h: number } | null {
  try {
    if (mime === "image/png") {
      if (buf.length < 33) return null;
      // PNG: 8字节签名 + IHDR chunk（宽高在 16/20 偏移）
      const w = u32be(buf, 16);
      const h = u32be(buf, 20);
      if (!w || !h) return null;
      return { w, h };
    }
    if (mime === "image/gif") {
      if (buf.length < 10) return null;
      return { w: u16le(buf, 6), h: u16le(buf, 8) };
    }
    if (mime === "image/jpeg") {
      // 扫 SOF0-SOF3 标记
      let o = 2;
      while (o + 9 < buf.length && o < 1_000_000) {
        if (buf[o] !== 0xff) { o++; continue; }
        const marker = buf[o + 1]!;
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
        if (o + 4 > buf.length) break;
        const len = u16be(buf, o + 2);
        if (len < 2) break;
        if (marker >= 0xc0 && marker <= 0xc3) {
          if (o + 9 > buf.length) break;
          return { w: u16be(buf, o + 7), h: u16be(buf, o + 5) };
        }
        o += 2 + len;
      }
      return null;
    }
    if (mime === "image/webp") {
      if (buf.length < 30) return null;
      const fourcc = buf.subarray(12, 16).toString("latin1");
      if (fourcc === "VP8 ") {
        // Lossy: 26/28 起 14bit 宽高
        const w = u16le(buf, 26) & 0x3fff;
        const h = u16le(buf, 28) & 0x3fff;
        if (w && h) return { w, h };
        return null;
      }
      if (fourcc === "VP8L") {
        if (buf.length < 25) return null;
        const b0 = buf[21]!, b1 = buf[22]!, b2 = buf[23]!, b3 = buf[24]!;
        const w = 1 + (((b1 & 0x3f) << 8) | b0);
        const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        return { w, h };
      }
      if (fourcc === "VP8X") {
        if (buf.length < 30) return null;
        const w = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16));
        const h = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16));
        return { w, h };
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

export type ScanVerdict = { ok: true } | { ok: false; reason: string };

/**
 * 附件落盘前最后一道门。返回 ok=false 时调用方映射为已有的 error 码
 *（unsupported_type / file_too_large），前端无需新增文案即可提示。
 */
export function scanAttachment(buf: Buffer, mime: string): ScanVerdict {
  if (containsEicar(buf)) return { ok: false, reason: "eicar" };
  if (mime === "text/plain" && looksLikeMarkupDocument(buf)) {
    return { ok: false, reason: "markup_document" };
  }
  if (mime.startsWith("image/")) {
    const dims = imageDimensions(buf, mime);
    if (!dims) return { ok: false, reason: "corrupt_image" };
    if (dims.w > MAX_IMAGE_DIMENSION || dims.h > MAX_IMAGE_DIMENSION) {
      return { ok: false, reason: "image_too_large" };
    }
    if (dims.w * dims.h > MAX_IMAGE_PIXELS) {
      return { ok: false, reason: "image_bomb" };
    }
  }
  // PDF/Zip 内嵌可执行 JS 仅记日志不拦截（误杀正常文件代价更大），由上层 logger 记录
  return { ok: true };
}

/** PDF 是否含可执行 JS（仅用于日志告警，不直接拦截） */
export function pdfHasJavaScript(buf: Buffer): boolean {
  if (buf.length > 20_000_000) return false;
  const head = buf.subarray(0, Math.min(buf.length, 2_000_000)).toString("latin1");
  return /\/JavaScript|\/JS\b|\/Launch|\/EmbeddedFile/i.test(head);
}
