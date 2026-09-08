import { describe, expect, it } from "vitest";
import { novelGenSchema, parseNovelJson } from "@/lib/novel-ai";
import { writerSettingsSchema } from "@/lib/writer-settings";

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
  it("字数/状态缺省时交给 AI 写作设置决定，import 默认落库", () => {
    const parsed = novelGenSchema.parse({ premise: "一个男生在雨夜捡到一只猫，认识了楼下邻居" });
    expect(parsed.words).toBeUndefined();
    expect(parsed.status).toBeUndefined();
    expect(parsed.import).toBe(true);
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

describe("writerSettingsSchema AI 写作独立配置", () => {
  it("接受 http(s) 地址与合理范围", () => {
    const parsed = writerSettingsSchema.parse({
      enabled: true,
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      temperature: 0.9,
      defaultWords: 900,
      defaultStatus: "pending",
    });
    expect(parsed.defaultStatus).toBe("pending");
    expect(parsed.defaultWords).toBe(900);
  });

  it("拒绝非 http(s) 地址、越界温度与字数", () => {
    const base = { enabled: true, model: "m", temperature: 0.85, defaultWords: 700, defaultStatus: "approved" };
    expect(writerSettingsSchema.safeParse({ ...base, baseUrl: "file:///tmp/x" }).success).toBe(false);
    expect(writerSettingsSchema.safeParse({ ...base, baseUrl: "https://api.example.com/v1", temperature: 2 }).success).toBe(false);
    expect(writerSettingsSchema.safeParse({ ...base, baseUrl: "https://api.example.com/v1", defaultWords: 200 }).success).toBe(false);
    expect(writerSettingsSchema.safeParse({ ...base, baseUrl: "https://api.example.com/v1", defaultStatus: "draft" }).success).toBe(false);
  });
});
