/** 只允许站内路径；反斜杠和控制字符可能被浏览器归一成跨站地址。 */
export function safeNext(raw: FormDataEntryValue | null, fallback = ""): string {
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(raw)
    ? raw
    : fallback;
}
