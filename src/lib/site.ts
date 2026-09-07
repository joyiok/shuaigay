import { z } from "zod";

export const DEFAULT_SITE_SETTINGS = {
  siteName: "SHUAI GAY",
  siteTitle: "SHUAI GAY 论坛 · 开放 · 克制 · 高效",
  siteDescription: "SHUAI GAY 社区 — 连接兴趣 · 遇见同好 · 分享精彩。综合讨论、技术交流、生活分享与资源互助的极简高性能论坛。",
  logoUrl: "",
} as const;

export const siteSettingsSchema = z.object({
  siteName: z.string().trim().min(1).max(40),
  siteTitle: z.string().trim().min(1).max(100),
  siteDescription: z.string().trim().min(1).max(300),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => !value || (value.startsWith("/") && !value.startsWith("//")) || /^https?:\/\/\S+$/i.test(value), "Logo 仅支持站内路径或 http(s) 地址"),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

/** 站点绝对地址。生产环境必须通过 SITE_URL 注入真实域名。 */
export function siteUrl(): URL {
  return new URL(process.env.SITE_URL ?? "https://forum.example.com");
}
