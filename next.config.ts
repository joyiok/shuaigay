import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 模式:build 产物自带最小 node_modules,Docker 镜像最小化
  output: "standalone",
  experimental: {
    // 附件上传走 server action,放宽请求体限制
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
