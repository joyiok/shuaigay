export function sniffMime(buf: Buffer): string | null {
  const ascii = (n: number) => buf.slice(0, n).toString("latin1");

  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";
  if (buf.length >= 4 && buf[0] === 0x89 && ascii(4) === "\x89PNG")
    return "image/png";
  if (ascii(3) === "GIF") return "image/gif";
  if (
    buf.length >= 12 &&
    ascii(4) === "RIFF" &&
    buf.slice(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  if (ascii(5) === "%PDF-") return "application/pdf";
  // zip 家族(zip/docx/xlsx)统一按 zip 存
  if (ascii(2) === "PK") return "application/zip";
  // 没有魔数的,只要不含 NUL 字节就当纯文本;其余一律拒绝
  if (buf.length > 0 && !buf.slice(0, 512).includes(0)) return "text/plain";
  return null;
}
