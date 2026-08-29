/**
 * 站点绝对地址。生产环境必须通过 SITE_URL 注入真实域名
 * (Caddyfile 的 DOMAIN 与 Docker Compose 同步配置),
 * 缺省时用 IANA 保留的示例域名兜底,避免 sitemap 指向假站点。
 */
export function siteUrl(): URL {
  return new URL(process.env.SITE_URL ?? "https://forum.example.com");
}