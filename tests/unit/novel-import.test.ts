import { describe, expect, it } from "vitest";
import { MAX_CHAPTER_CHARS, MAX_IMPORT_BATCH_WORKS, MAX_IMPORT_CHAPTERS, importNovelBatchSchema, importNovelSchema, withChapterTitle } from "@/lib/novel-import";

describe("importNovelSchema 导入参数校验", () => {
  it("默认导入到小说版，章节数 1-50", () => {
    const parsed = importNovelSchema.parse({ title: "测试作品标题", chapters: [{ contentMd: "正文" }] });
    expect(parsed.boardSlug).toBe("novel");
    expect(parsed.chapters).toHaveLength(1);
    expect(importNovelSchema.safeParse({ title: "测试作品标题", chapters: [] }).success).toBe(false);
    expect(
      importNovelSchema.safeParse({
        title: "测试作品标题",
        chapters: Array.from({ length: MAX_IMPORT_CHAPTERS + 1 }, () => ({ contentMd: "x" })),
      }).success,
    ).toBe(false);
  });

  it("单章正文有长度上限，与站内回复一致", () => {
    expect(MAX_CHAPTER_CHARS).toBe(20_000);
    expect(importNovelSchema.safeParse({ title: "测试作品标题", chapters: [{ contentMd: "x".repeat(MAX_CHAPTER_CHARS) }] }).success).toBe(true);
    expect(importNovelSchema.safeParse({ title: "测试作品标题", chapters: [{ contentMd: "x".repeat(MAX_CHAPTER_CHARS + 1) }] }).success).toBe(false);
  });

  it("新建时 title 必填但可省略（由执行层给出更友好的报错）", () => {
    expect(importNovelSchema.safeParse({ chapters: [{ contentMd: "x" }] }).success).toBe(true);
    expect(importNovelSchema.safeParse({ title: "短", chapters: [{ contentMd: "x" }] }).success).toBe(false);
  });

  it("支持追加模式与来源/授权留痕字段", () => {
    const parsed = importNovelSchema.parse({
      threadId: "t1",
      source: "作者投稿",
      license: "CC BY-NC 4.0",
      chapters: [{ title: "第四章", contentMd: "正文" }],
    });
    expect(parsed.threadId).toBe("t1");
    expect(parsed.source).toBe("作者投稿");
    expect(parsed.license).toBe("CC BY-NC 4.0");
  });

  it("支持批量导入与来源幂等键", () => {
    const work = { importKey: "discuz:52:13", title: "测试作品标题", chapters: [{ contentMd: "正文" }] };
    expect(importNovelSchema.parse(work).importKey).toBe("discuz:52:13");
    expect(importNovelBatchSchema.safeParse({ works: Array.from({ length: MAX_IMPORT_BATCH_WORKS + 1 }, () => work) }).success).toBe(false);
  });
});

describe("withChapterTitle 章节标题补全", () => {
  it("正文首行没有标题时补一行 # 标题", () => {
    expect(withChapterTitle({ title: "第四章 离别", contentMd: "车站的风很大。" })).toBe("# 第四章 离别\n\n车站的风很大。");
  });

  it("正文首行已是同名标题时不重复补", () => {
    expect(withChapterTitle({ title: "第四章 离别", contentMd: "第四章 离别\n\n车站的风很大。" })).toBe("第四章 离别\n\n车站的风很大。");
    expect(withChapterTitle({ title: "第四章 离别", contentMd: "# 第四章 离别\n\n车站的风很大。" })).toBe("# 第四章 离别\n\n车站的风很大。");
  });

  it("没传 title 时原样返回", () => {
    expect(withChapterTitle({ contentMd: "车站的风很大。" })).toBe("车站的风很大。");
  });
});
