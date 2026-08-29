import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("Markdown 渲染与消毒", () => {
  it("保留基本格式", () => {
    const html = renderMarkdown("**加粗** 和 `code`");
    expect(html).toContain("<strong>加粗</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("剥离 script 标签", () => {
    const html = renderMarkdown("<script>alert(1)</script>hello");
    expect(html).not.toContain("<script");
    expect(html).toContain("hello");
  });

  it("链接自动加 rel nofollow", () => {
    const html = renderMarkdown("[点我](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("javascript: 链接被剥掉", () => {
    const html = renderMarkdown("[x](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("图片只允许 http(s)", () => {
    expect(renderMarkdown("![a](https://x.com/i.png)")).toContain("<img");
    expect(renderMarkdown("![a](javascript:alert(1))")).not.toContain("<img");
  });

  it("iframe 被剥掉", () => {
    const html = renderMarkdown("<iframe src='https://evil.com'></iframe>");
    expect(html).not.toContain("<iframe");
  });

  it("事件属性被剥掉", () => {
    const html = renderMarkdown("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("onerror");
  });
});
