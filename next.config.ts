import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 模式:build 产物自带最小 node_modules,Docker 镜像最小化
  output: "standalone",
  compress: true,
  poweredByHeader: false,
  // 性能：自动优化三方字体与包导入
  experimental: {
    // 附件上传走 server action,放宽请求体限制
    serverActions: {
      bodySizeLimit: "25mb",
    },
    optimizePackageImports: ["marked", "sanitize-html"],
  },
  images: {
    // 头像走 /api/avatar?file= ，本地存储无需远程域；S3 时可按需加 remotePatterns
    unoptimized: false,
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    return [
      {
        source: "/ranking",
        destination: "/hot",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // 基础 CSP 纵深防御：页面只允许同源 + 内联样式/图片 data/blob（灯箱、头像预览用）。
          // Markdown 渲染已由 sanitize-html 白名单过滤，CSP 是第二道闸。
          // 如需嵌入外部图片/视频，先放行对应域名再上线。
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://challenges.cloudflare.com",
              "frame-src https://challenges.cloudflare.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        source: "/api/avatar/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        source: "/uploads/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
