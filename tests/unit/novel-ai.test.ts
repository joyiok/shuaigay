import { describe, expect, it } from "vitest";
import { novelGenSchema, parseNovelJson } from "@/lib/novel-ai";

describe("parseNovelJson 模型输出解析", () => {
  const good = '{"title":"雨夜","chapterTitle":"第 1 章 雨夜","contentMd":"# 第 1 章 雨夜\\n\\n正文"}';

  it("解析纯 JSON", () => {
    expect(parseNovelJson(good)).toEqual({ title: "雨夜", chapterTitle: "第 1 章 雨夜", contentMd: "# 第 1 章 雨夜\n\n正文" });
  });

  it("容忍 ```json 代码块与前后废话", () => {
    expect(parseNovelJson("```json\n" + good + "\n```")?.title).toBe("雨夜");
    expect(parseNovelJson("好的，这是结果：\n" + good + "\n希望满意")?.title).toBe("雨夜");
  });

  it("缺少 contentMd 或非法 JSON 返回 null", () => {
    expect(parseNovelJson('{"title":"x","chapterTitle":"y"}')).toBeNull();
    expect(parseNovelJson("完全不是 JSON")).toBeNull();
    expect(parseNovelJson("")).toBeNull();
  });

  it("正文超长时截断到 20000 字", () => {
    const long = JSON.stringify({ title: "x", chapterTitle: "y", contentMd: "字".repeat(25_000) });
    expect(parseNovelJson(long)?.contentMd.length).toBe(20_000);
  });
});

describe("novelGenSchema 生成参数", () => {
  it("默认字数 700、直接落库、已发布", () => {
    const parsed = novelGenSchema.parse({ premise: "一个男生在雨夜捡到一只猫，认识了楼下邻居" });
    expect(parsed.words).toBe(700);
    expect(parsed.import).toBe(true);
    expect(parsed.status).toBe("approved");
  });

  it("字数与状态有边界", () => {
    expect(novelGenSchema.safeParse({ premise: "测试设定内容不少于十个字", words: 200 }).success).toBe(false);
    expect(novelGenSchema.safeParse({ premise: "测试设定内容不少于十个字", words: 2000 }).success).toBe(false);
    expect(novelGenSchema.safeParse({ premise: "测试设定内容不少于十个字", status: "draft" }).success).toBe(false);
    expect(novelGenSchema.safeParse({ premise: "测试设定内容不少于十个字", status: "pending" }).success).toBe(true);
  });

  it("支持续写模式与预览模式", () => {
    const parsed = novelGenSchema.parse({ threadId: "t1", import: false, instruction: "本章写重逢" });
    expect(parsed.threadId).toBe("t1");
    expect(parsed.import).toBe(false);
  });
});
