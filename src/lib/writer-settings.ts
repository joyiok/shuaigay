/**
 * AI 写作（小说生成）独立配置。
 *
 * 与站点「AI 自动运营」分开：可以配不同的模型/地址/密钥，互不影响。
 * 密钥复用 AI_SETTINGS_ENCRYPTION_KEY 的 AES-GCM 加密（与 AI 密钥同一套机制）。
 */
import { z } from "zod";
import { db } from "./db";
import { decryptAiSecret, encryptAiSecret } from "./ai-admin";

export const writerSettingsSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().trim().max(300).url().refine((v) => /^https?:\/\/\S+$/i.test(v), "模型地址仅支持 http(s)"),
  model: z.string().trim().min(1).max(100),
  temperature: z.coerce.number().min(0).max(1.5).default(0.85),
  defaultWords: z.coerce.number().int().min(300).max(1500).default(700),
  defaultStatus: z.enum(["approved", "pending"]).default("approved"),
});

export type WriterSettingsInput = z.infer<typeof writerSettingsSchema>;

export interface WriterRuntimeSettings extends WriterSettingsInput {
  apiKey: string;
}

export interface WriterSettingsPanel extends WriterSettingsInput {
  apiKeyConfigured: boolean;
}

const DEFAULTS: WriterSettingsInput = {
  enabled: false,
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  temperature: 0.85,
  defaultWords: 700,
  defaultStatus: "approved",
};

export async function getWriterSettings(): Promise<WriterRuntimeSettings> {
  const row = await db.writerSetting.findUnique({ where: { id: "writer" } }).catch(() => null);
  if (!row) return { ...DEFAULTS, apiKey: "" };
  return {
    enabled: row.enabled,
    baseUrl: row.baseUrl,
    model: row.model,
    temperature: Math.max(0, Math.min(1.5, row.temperature)),
    defaultWords: Math.max(300, Math.min(1500, row.defaultWords)),
    defaultStatus: row.defaultStatus === "pending" ? "pending" : "approved",
    apiKey: decryptAiSecret(row.apiKeyEncrypted) || process.env.AI_WRITER_API_KEY?.trim() || "",
  };
}

export async function getWriterSettingsPanel(): Promise<WriterSettingsPanel> {
  const row = await db.writerSetting.findUnique({ where: { id: "writer" } }).catch(() => null);
  const runtime = await getWriterSettings();
  return {
    enabled: runtime.enabled,
    baseUrl: runtime.baseUrl,
    model: runtime.model,
    temperature: runtime.temperature,
    defaultWords: runtime.defaultWords,
    defaultStatus: runtime.defaultStatus,
    apiKeyConfigured: Boolean(runtime.apiKey),
  };
}

/** 保存配置；apiKey 为空表示保持原值，clearApiKey 为真表示清除 */
export async function saveWriterSettings(
  input: WriterSettingsInput,
  opts: { apiKey?: string; clearApiKey?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  let apiKeyEncrypted: string | null | undefined;
  if (opts.clearApiKey) {
    apiKeyEncrypted = null;
  } else if (opts.apiKey) {
    const encrypted = encryptAiSecret(opts.apiKey);
    if (!encrypted) return { ok: false, error: "服务器未配置 AI_SETTINGS_ENCRYPTION_KEY，暂不能保存密钥" };
    apiKeyEncrypted = encrypted;
  }

  const data = {
    enabled: input.enabled,
    baseUrl: input.baseUrl,
    model: input.model,
    temperature: input.temperature,
    defaultWords: input.defaultWords,
    defaultStatus: input.defaultStatus,
    ...(apiKeyEncrypted !== undefined ? { apiKeyEncrypted } : {}),
  };
  await db.writerSetting.upsert({
    where: { id: "writer" },
    update: data,
    create: { id: "writer", ...data },
  });
  return { ok: true };
}
