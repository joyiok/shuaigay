import { describe, expect, it } from "vitest";
import { parseTagInput, tagSlug, MAX_TAGS_PER_THREAD } from "@/lib/taxonomy";
import { parsePollOptions, readPollForm, POLL_MAX_OPTIONS } from "@/lib/poll";

describe("标签解析", () => {
  it("支持中英文逗号、空格、井号分隔", () => {
    expect(parseTagInput("都市, 悬疑、长篇")).toEqual(["都市", "悬疑", "长篇"]);
    expect(parseTagInput("#科幻 #赛博")).toEqual(["科幻", "赛博"]);
    expect(parseTagInput("a  b   c")).toEqual(["a", "b", "c"]);
  });

  it("去重（忽略大小写）并限制数量", () => {
    expect(parseTagInput("SciFi scifi SCIFI")).toEqual(["SciFi"]);
    const many = parseTagInput("一 二 三 四 五");
    expect(many).toHaveLength(MAX_TAGS_PER_THREAD);
    expect(many).toEqual(["一", "二", "三"]);
  });

  it("过滤超长与空标签，非字符串返回空数组", () => {
    expect(parseTagInput("这个标签实在是太长了超过十二个字符了 短")).toEqual(["短"]);
    expect(parseTagInput(",,，  ")).toEqual([]);
    expect(parseTagInput(null)).toEqual([]);
    expect(parseTagInput(123)).toEqual([]);
  });
});

describe("标签 slug", () => {
  it("中文保留，拉丁字母小写，空格转连字符", () => {
    expect(tagSlug("都市")).toBe("都市");
    expect(tagSlug("Sci Fi")).toBe("sci-fi");
    expect(tagSlug("Hello,World!")).toBe("helloworld");
  });

  it("空标签兜底", () => {
    expect(tagSlug("!!!")).toBe("tag");
  });
});

describe("投票选项解析", () => {
  it("一行一个，剥掉列表符号，忽略空行", () => {
    expect(parsePollOptions("- 选项 A\n2. 选项 B\n\n * 选项 C")).toEqual(["选项 A", "选项 B", "选项 C"]);
  });

  it("最多 10 个选项，每个截断到 40 字", () => {
    const many = Array.from({ length: 20 }, (_, i) => `选项${i}`).join("\n");
    expect(parsePollOptions(many)).toHaveLength(POLL_MAX_OPTIONS);
    expect(parsePollOptions("x".repeat(80))[0]).toHaveLength(40);
  });

  it("非字符串返回空数组", () => {
    expect(parsePollOptions(undefined)).toEqual([]);
  });
});

describe("表单读取投票", () => {
  const form = (data: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) fd.set(k, v);
    return fd;
  };

  it("没问题目或选项不足 2 个时视为没有投票", () => {
    expect(readPollForm(form({ pollOptions: "A\nB" }))).toBeNull();
    expect(readPollForm(form({ pollQuestion: "选一个", pollOptions: "只有一个" }))).toBeNull();
    expect(readPollForm(form({ pollQuestion: "选一个" }))).toBeNull();
  });

  it("正常解析，天数夹在 0-30 之间", () => {
    const poll = readPollForm(form({ pollQuestion: " 吃什么 ", pollOptions: "面\n饭", pollDays: "3" }));
    expect(poll).toMatchObject({ question: "吃什么", options: ["面", "饭"], multiple: false, days: 3 });
    expect(readPollForm(form({ pollQuestion: "x", pollOptions: "a\nb", pollDays: "99" }))?.days).toBe(30);
    expect(readPollForm(form({ pollQuestion: "x", pollOptions: "a\nb", pollMultiple: "on" }))?.multiple).toBe(true);
  });
});
