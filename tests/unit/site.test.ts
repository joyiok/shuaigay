import { expect, it } from "vitest";
import { DEFAULT_SITE_SETTINGS, siteSettingsSchema } from "@/lib/site";

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
