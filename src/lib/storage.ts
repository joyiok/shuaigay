import { randomBytes } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export interface StoredFile {
  storedName: string;
  sizeBytes: number;
}

export interface StorageDriver {
  save(data: Buffer, ext: string): Promise<StoredFile>;
  remove(storedName: string): Promise<void>;
}

export const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "text/plain": ".txt",
};

export function extensionForMime(mime: string): string {
  return MIME_EXTENSIONS[mime] ?? ".bin";
}

export function maxUploadBytes(): number {
  return Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;
}

export const MAX_FILES_PER_POST = 5;

class LocalStorage implements StorageDriver {
  constructor(private root: string) {}

  async save(data: Buffer, ext: string): Promise<StoredFile> {
    // 文件名完全由服务端生成,与用户输入无关
    const storedName = `${new Date().toISOString().slice(0, 10)}/${randomBytes(16).toString("hex")}${ext}`;
    const full = this.resolve(storedName);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return { storedName, sizeBytes: data.byteLength };
  }

  async remove(storedName: string): Promise<void> {
    await unlink(this.resolve(storedName)).catch(() => {});
  }

  // 防路径穿越:解析结果必须落在 root 内
  private resolve(storedName: string): string {
    const root = path.resolve(this.root);
    const full = path.resolve(root, storedName);
    if (!full.startsWith(root + path.sep)) {
      throw new Error(`invalid stored name: ${storedName}`);
    }
    return full;
  }
}

export function getStorage(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  switch (driver) {
    case "local":
      return new LocalStorage(process.env.UPLOAD_DIR ?? "./uploads");
    // 以后要上对象存储,在这里加 "s3" 分支,业务代码不动
    default:
      throw new Error(`unknown STORAGE_DRIVER: ${driver}`);
  }
}
