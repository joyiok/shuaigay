import { describe, expect, it } from "vitest";
import { collectMentionCandidates, linkMentions, renderMarkdown } from "@/lib/markdown";
import { containsSensitive } from "@/lib/sensitive";

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

describe("@提及解析与渲染", () => {
  it("从 Markdown 文本收集候选 @", () => {
    expect(collectMentionCandidates(["你好 @alice 欢迎 @bob_dev"])).toEqual(["alice", "bob_dev"]);
    expect(collectMentionCandidates(["邮箱 foo@bar.com 不算"])).toEqual([]);
  });

  it("中文紧贴 @ 不算提及，标点后算", () => {
    expect(collectMentionCandidates(["看看@alice"])).toEqual([]);
    expect(collectMentionCandidates(["（@alice）"])).toEqual(["alice"]);
    expect(collectMentionCandidates(["。@bob 说"])).toEqual(["bob"]);
  });

  it("用户名长度 3-20 过滤", () => {
    expect(collectMentionCandidates(["@ab 太短"])).toEqual([]);
    expect(collectMentionCandidates(["@a_very_long_username_exceeds"])).toEqual([]);
    expect(collectMentionCandidates(["@abc 刚好3位"])).toEqual(["abc"]);
  });

  it("linkMentions 把存在的用户转成链接，不存在的保持原样", () => {
    const existing = new Set(["alice", "bob"]);
    const html = linkMentions("嗨 @alice 和 @ghost", existing);
    expect(html).toContain('href="/u/alice"');
    expect(html).toContain("@ghost");
    expect(html).toContain("post-mention");
  });

  it("linkMentions 跳过代码块和链接内部", () => {
    const existing = new Set(["alice"]);
    const html = linkMentions("<code>@alice</code> 外面 @alice", existing);
    expect(html).toContain("<code>@alice</code>");
    expect(html.match(/post-mention/g)).toHaveLength(1);
  });

  it("renderMarkdown 后可叠加 linkMentions 完成提及高亮", () => {
    const raw = renderMarkdown("嗨 @alice 来看看");
    const linked = linkMentions(raw, new Set(["alice"]));
    expect(linked).toContain('class="post-mention"');
    expect(linked).toContain("/u/alice");
  });
});

describe("敏感词过滤", () => {
  it("命中敏感词返回 true，大小写不敏感", async () => {
    expect(await containsSensitive("这里有傻逼")).toBe(true);
    expect(await containsSensitive("含有 NMSL 词汇")).toBe(true);
    expect(await containsSensitive("正常内容没有问题")).toBe(false);
  });

  it("敏感词在长文本中也能命中", async () => {
    expect(await containsSensitive("a".repeat(100) + "cnm" + "b".repeat(100))).toBe(true);
    expect(await containsSensitive("讨论技术，交流学习")).toBe(false);
  });

  it("空字符串与边界词不误伤", async () => {
    expect(await containsSensitive("")).toBe(false);
    expect(await containsSensitive("傻" )).toBe(false);
    expect(await containsSensitive("草泥马来了")).toBe(true);
  });

  it("敏感词检查用于发帖与举报拦载", async () => {
    const cases = ["去死吧 你", "婊子", "狗娘养的", "nmsl", "cnm"];
    for (const c of cases) expect(await containsSensitive(c)).toBe(true);
    expect(await containsSensitive("今天天气不错 @alice 来聊聊")).toBe(false);
  });
});
