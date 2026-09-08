import { describe, expect, it } from "vitest";
import { novelChapterTitle } from "@/lib/novel";

describe("小说章节标题 novelChapterTitle", () => {
  it("取正文第一行并去掉 markdown 记号", () => {
    expect(novelChapterTitle("# 第一章 初见\n\n正文", 1)).toBe("第一章 初见");
    expect(novelChapterTitle("**雨夜**\n\n内容", 2)).toBe("雨夜");
  });

  it("跳过图片与链接行", () => {
    expect(novelChapterTitle("![封面](/x.png)\n第二章 重逢", 2)).toBe("第二章 重逢");
    expect(novelChapterTitle("[封面](/x.png)\n第二章 重逢", 2)).toBe("第二章 重逢");
  });

  it("没有可用首行时退回「第 N 章」", () => {
    expect(novelChapterTitle("", 7)).toBe("第 7 章");
    expect(novelChapterTitle("\n\n   \n", 3)).toBe("第 3 章");
  });

  it("过长标题截断到 24 字", () => {
    const long = "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十";
    expect(novelChapterTitle(long, 1)).toHaveLength(24);
  });
});
