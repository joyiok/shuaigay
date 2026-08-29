import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 接口、用户上传的附件、账号页面不进索引
        disallow: ["/api/", "/uploads/", "/login", "/register", "/search?q="],
      },
    ],
    sitemap: `${siteUrl().origin}/sitemap.xml`,
  };
}