import { describe, expect, it } from "vitest";
import { sniffMime } from "@/lib/filetype";

describe("文件魔数嗅探", () => {
  it("识别常见类型", () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffMime(Buffer.from("GIF89a"))).toBe("image/gif");
    expect(sniffMime(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(Buffer.from("PK\x03\x04"))).toBe("application/zip");
    expect(sniffMime(Buffer.from("hello world"))).toBe("text/plain");
  });

  it("拒绝未知二进制(比如伪装成图片的可执行文件)", () => {
    expect(sniffMime(Buffer.from([0x4d, 0x5a, 0x00, 0x01]))).toBeNull(); // Windows PE
    expect(sniffMime(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00]))).toBeNull(); // Linux ELF
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });

  it("WEBP 识别", () => {
    const webp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.alloc(4),
      Buffer.from("WEBP"),
    ]);
    expect(sniffMime(webp)).toBe("image/webp");
  });
});
