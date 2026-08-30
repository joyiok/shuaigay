import { randomBytes } from "node:crypto";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export interface StoredFile {
  storedName: string;
  sizeBytes: number;
}

export interface StorageDriver {
  save(data: Buffer, ext: string): Promise<StoredFile>;
  remove(storedName: string): Promise<void>;
  /** 仅头像/自检场景需要：读回文件，仅在有实现时可用 */
  read?(storedName: string): Promise<Buffer | null>;
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

/* 头像单独限制 2MB */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

class LocalStorage implements StorageDriver {
  constructor(private root: string) {}

  async save(data: Buffer, ext: string): Promise<StoredFile> {
    const storedName = `${new Date().toISOString().slice(0, 10)}/${randomBytes(16).toString("hex")}${ext}`;
    const full = this.resolve(storedName);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return { storedName, sizeBytes: data.byteLength };
  }

  async remove(storedName: string): Promise<void> {
    await unlink(this.resolve(storedName)).catch(() => {});
  }

  async read(storedName: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(storedName));
    } catch {
      return null;
    }
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

class S3Storage implements StorageDriver {
  private s3: S3Client | null = null;
  private bucket: string;
  private endpoint?: string;

  constructor() {
    const accessKeyId =
      process.env.S3_ACCESS_KEY_ID ??
      process.env.S3_ACCESS_KEY ??
      process.env.AWS_ACCESS_KEY_ID ??
      "";
    const secretAccessKey =
      process.env.S3_SECRET_ACCESS_KEY ??
      process.env.S3_SECRET_KEY ??
      process.env.AWS_SECRET_ACCESS_KEY ??
      "";
    const region = process.env.S3_REGION ?? process.env.AWS_REGION ?? "us-east-1";
    this.bucket = process.env.S3_BUCKET ?? "";
    this.endpoint = process.env.S3_ENDPOINT || undefined;

    if (!this.bucket || !accessKeyId || !secretAccessKey) {
      this.s3 = null;
      return;
    }

    this.s3 = new S3Client({
      region,
      endpoint: this.endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" || !!this.endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  isConfigured(): boolean {
    return !!this.s3 && !!this.bucket;
  }

  async save(data: Buffer, ext: string): Promise<StoredFile> {
    if (!this.s3 || !this.bucket) throw new Error("S3 未配置");
    const storedName = `${new Date().toISOString().slice(0, 10)}/${randomBytes(16).toString("hex")}${ext}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storedName,
        Body: data,
        ContentLength: data.byteLength,
      }),
    );
    return { storedName, sizeBytes: data.byteLength };
  }

  async remove(storedName: string): Promise<void> {
    if (!this.s3 || !this.bucket) return;
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storedName,
        }),
      );
    } catch {
      // 删除失败静默
    }
  }

  async read(storedName: string): Promise<Buffer | null> {
    if (!this.s3 || !this.bucket) return null;
    try {
      const res = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storedName,
        }),
      );
      if (!res.Body) return null;
      const chunks: Buffer[] = [];
      const stream = res.Body as unknown as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }
}

export function getStorage(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  if (driver === "s3") {
    const s3 = new S3Storage();
    if (s3.isConfigured()) return s3;
    // 无配置时回退 local，保持服务不崩
    console.warn("[storage] STORAGE_DRIVER=s3 但 S3 配置不全，回退到 local");
    return new LocalStorage(process.env.UPLOAD_DIR ?? "./uploads");
  }
  if (driver === "local") {
    return new LocalStorage(process.env.UPLOAD_DIR ?? "./uploads");
  }
  throw new Error(`unknown STORAGE_DRIVER: ${driver}`);
}

/** 头像展示 URL：统一走 /api/avatar?file= 避免直接暴露存储后端 */
export function avatarUrlForStoredName(storedName: string | null | undefined): string | null {
  if (!storedName) return null;
  return `/api/avatar?file=${encodeURIComponent(storedName)}`;
}
