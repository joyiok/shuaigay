import { describe, expect, it } from "vitest";
import { jsonLdHtml } from "@/lib/jsonld";

describe("jsonLdHtml JSON-LD 安全序列化", () => {
  it("转义 </script>，阻断 script 突破", () => {
    const out = jsonLdHtml({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script\\u003e");
    // 转义后仍是合法 JSON 且语义不变
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' });
  });

  it("转义 & 与 U+2028/2029", () => {
    const out = jsonLdHtml({ q: "a&b\u2028c\u2029d" });
    expect(out).not.toContain("&");
    expect(JSON.parse(out)).toEqual({ q: "a&b\u2028c\u2029d" });
  });

  it("普通数据保持不变", () => {
    expect(jsonLdHtml({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
  });
});
