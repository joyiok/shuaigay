import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dirUsage, formatBytes } from "@/lib/ops-metrics";

describe("运维指标：字节格式化", () => {
  it("按量级切换单位", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });
});

describe("运维指标：目录占用统计", () => {
  let root = "";
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "ops-"));
    await writeFile(path.join(root, "a.txt"), "x".repeat(100));
    await mkdir(path.join(root, "sub"), { recursive: true });
    await writeFile(path.join(root, "sub", "b.txt"), "y".repeat(200));
    await mkdir(path.join(root, "sub", "deep"), { recursive: true });
    await writeFile(path.join(root, "sub", "deep", "c.txt"), "z".repeat(50));
  });
  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("递归统计文件数与字节数", async () => {
    const usage = await dirUsage(root);
    expect(usage.files).toBe(3);
    expect(usage.bytes).toBe(350);
    expect(usage.truncated).toBe(false);
  });

  it("超过文件上限时标记 truncated，避免大目录拖死后台", async () => {
    const usage = await dirUsage(root, 2);
    expect(usage.truncated).toBe(true);
    expect(usage.files).toBe(3);
  });

  it("目录不存在时返回空统计而不是抛错", async () => {
    const usage = await dirUsage(path.join(root, "nope"));
    expect(usage).toEqual({ bytes: 0, files: 0, truncated: false });
  });
});
