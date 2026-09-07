import { expect, it } from "vitest";
import {
  DEFAULT_SITE_SETTINGS,
  siteLogoUrlForStoredName,
  siteSettingsSchema,
  storedNameFromSiteLogoUrl,
} from "@/lib/site";

it("站点设置允许站内或 http(s) Logo，拒绝脚本地址并裁剪文本", () => {
  const result = siteSettingsSchema.safeParse({
    ...DEFAULT_SITE_SETTINGS,
    siteName: "  我的论坛  ",
    logoUrl: " /logo.svg ",
  });

  expect(result.success).toBe(true);
  if (result.success) expect(result.data).toMatchObject({ siteName: "我的论坛", logoUrl: "/logo.svg" });
  expect(siteSettingsSchema.safeParse({ ...DEFAULT_SITE_SETTINGS, logoUrl: "javascript:alert(1)" }).success).toBe(false);
  expect(siteSettingsSchema.safeParse({ ...DEFAULT_SITE_SETTINGS, logoUrl: "//cdn.example.com/logo.svg" }).success).toBe(false);
});

it("站内上传 Logo 地址可往返解析", () => {
  const storedName = `2026-09-07/${"a".repeat(32)}.png`;
  expect(storedNameFromSiteLogoUrl(siteLogoUrlForStoredName(storedName))).toBe(storedName);
  expect(storedNameFromSiteLogoUrl("/api/site-logo?file=../../secret.txt")).toBeNull();
});
