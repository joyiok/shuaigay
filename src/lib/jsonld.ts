/**
 * JSON-LD 序列化（XSS 安全版）：
 * JSON.stringify 原样输出 `<`，标题/简介里的 `</script>` 会闭合外层
 * `<script type="application/ld+json">` 形成存储型 XSS。
 * 这里把 `& < >` 转成 \u 转义（JSON 解析不受影响），外加 U+2028/2029。
 * 所有 ld+json 的 dangerouslySetInnerHTML 必须走这个函数。
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
