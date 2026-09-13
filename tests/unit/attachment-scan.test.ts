import { describe, expect, it } from "vitest";
import {
  containsEicar,
  imageDimensions,
  looksLikeMarkupDocument,
  pdfHasJavaScript,
  scanAttachment,
} from "@/lib/attachment-scan";

describe("附件安全扫描", () => {
  it("EICAR 直接拒收", () => {
    const buf = Buffer.from(`prefix X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H* suffix`);
    expect(containsEicar(buf)).toBe(true);
    expect(scanAttachment(buf, "text/plain")).toEqual({ ok: false, reason: "eicar" });
  });

  it("整文件是 HTML/SVG 文档时拒收，代码片段放行", () => {
    expect(looksLikeMarkupDocument(Buffer.from("  <svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script>"))).toBe(true);
    expect(looksLikeMarkupDocument(Buffer.from("<!DOCTYPE html><html><body>hi"))).toBe(true);
    expect(scanAttachment(Buffer.from("<html><body>phish</body></html>"), "text/plain").ok).toBe(false);
    // 代码片段含 script 标签但不是整文件文档，放行（下载时已是 attachment）
    expect(looksLikeMarkupDocument(Buffer.from("here is code: `<script>alert(1)</script>` in markdown"))).toBe(false);
  });

  it("图片炸弹防护：超大尺寸/超大像素拒收，正常放行", () => {
    // PNG 9000x10 -> 边超限
    const png = Buffer.alloc(33);
    png[0] = 0x89; png[1] = 0x50; png[2] = 0x4e; png[3] = 0x47;
    png.writeUInt32BE(9000, 16); png.writeUInt32BE(10, 20);
    expect(imageDimensions(png, "image/png")).toEqual({ w: 9000, h: 10 });
    expect(scanAttachment(png, "image/png")).toEqual({ ok: false, reason: "image_too_large" });
    // 正常小图放行
    const small = Buffer.alloc(33);
    small[0] = 0x89; small[1] = 0x50; small[2] = 0x4e; small[3] = 0x47;
    small.writeUInt32BE(100, 16); small.writeUInt32BE(100, 20);
    expect(scanAttachment(small, "image/png")).toEqual({ ok: true });
    // 损坏图片拒收
    expect(scanAttachment(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg").ok).toBe(false);
  });

  it("PDF 含 JS 仅告警不拦截", () => {
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /JavaScript (alert) >>\n");
    expect(pdfHasJavaScript(pdf)).toBe(true);
    expect(scanAttachment(pdf, "application/pdf")).toEqual({ ok: true });
  });
});
