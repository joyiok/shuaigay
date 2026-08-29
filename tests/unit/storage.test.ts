import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extensionForMime, getStorage } from "@/lib/storage";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "forum-uploads-"));
  process.env.UPLOAD_DIR = dir;
  process.env.STORAGE_DRIVER = "local";
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("本地存储驱动", () => {
  it("保存-存在-删除 往返,文件名由服务端随机生成", async () => {
    const storage = getStorage();
    const stored = await storage.save(Buffer.from("hello"), ".txt");

    expect(stored.sizeBytes).toBe(5);
    expect(stored.storedName).toMatch(/^\d{4}-\d{2}-\d{2}\/[a-f0-9]{32}\.txt$/);

    const full = path.join(dir, stored.storedName);
    await expect(stat(full)).resolves.toBeTruthy();

    await storage.remove(stored.storedName);
    await expect(stat(full)).rejects.toThrow();
  });

  it("扩展名映射", () => {
    expect(extensionForMime("image/png")).toBe(".png");
    expect(extensionForMime("unknown/type")).toBe(".bin");
  });
});
