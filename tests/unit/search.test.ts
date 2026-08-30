import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { makeExcerpt } from "@/lib/excerpt";

// mock 掉 db,只测游标分页/映射逻辑
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  db: { thread: { findMany }, post: { findMany } },
}));

import { searchPosts, searchThreads } from "@/lib/queries";

function makeThread(id: string, title: string, at: Date) {
  return {
    id,
    title,
    pinned: false,
    locked: false,
    createdAt: at,
    lastPostAt: at,
    board: { slug: "general", name: "综合讨论" },
    author: { username: "alice" },
    _count: { posts: 4 },
  };
}

function makePost(id: string, contentMd: string, at: Date) {
  return {
    id,
    contentMd,
    createdAt: at,
    authorId: "u1",
    author: { username: "bob", role: "USER" },
    attachments: [],
    thread: {
      id: "t1",
      title: "被搜索的主题",
      board: { slug: "general", name: "综合讨论" },
    },
  };
}

describe("makeExcerpt 命中摘录", () => {
  it("截取关键词前后半径,去掉 Markdown 符号", () => {
    const raw = "开头 **加粗** 内容 " + "很长的前缀正文 ".repeat(20) + "命中关键词" + " 很长的后缀正文 ".repeat(20) + "结尾";
    const ex = makeExcerpt(raw, "命中关键词");
    expect(ex).toContain("命中关键词");
    expect(ex).not.toContain("**");
    expect(ex.startsWith("…")).toBe(true);
    expect(ex.endsWith("…")).toBe(true);
  });

  it("关键词靠前时不加前缀省略号", () => {
    const ex = makeExcerpt("关键词就在开头，后面全是内容 " + "x ".repeat(80), "关键词");
    expect(ex.startsWith("关键词")).toBe(true);
    expect(ex.startsWith("…")).toBe(false);
  });

  it("大小写不敏感命中", () => {
    const ex = makeExcerpt("这里有 TypeScript 字样", "typescript");
    expect(ex.toLowerCase()).toContain("typescript");
  });

  it("不传关键词时直接取开头", () => {
    const ex = makeExcerpt("  第一句 #tag `code` 第二句  ", "");
    expect(ex).toContain("第一句");
    expect(ex).not.toContain("#");
  });

  it("空内容兜底", () => {
    expect(makeExcerpt("", "x")).toBe("");
  });
});

describe("searchThreads 游标翻页", () => {
  beforeEach(() => findMany.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("第一页:不带游标条件,返回 20 条 + 下一页游标,并附带置顶帖查询", async () => {
    const now = Date.now();
    const rows = Array.from({ length: 21 }, (_, i) =>
      makeThread(`th${i}`, `帖 ${i}`, new Date(now - i * 60_000)),
    );
    findMany
      .mockResolvedValueOnce(rows) // 非置顶
      .mockResolvedValueOnce([makeThread("pin1", "置顶帖", new Date(now - 999))]); // 置顶
    findMany.mockResolvedValueOnce([]); // 用不到

    const r = await searchThreads("帖", undefined, null, 20);
    expect(r.items).toHaveLength(20);
    expect(r.items[0]!.title).toBe("帖 0");
    expect(r.items[0]!.boardSlug).toBe("general");
    expect(r.nextCursor).toBeTruthy();
    expect(r.nextCursor).toBe(encodeCursor({ t: rows[19]!.lastPostAt.toISOString(), id: rows[19]!.id }));

    // 第一页的关键词条件
    const call = findMany.mock.calls[0]![0] as { where: { AND: unknown[] } };
    expect(JSON.stringify(call.where.AND[0])).toContain('"contains"');
    // 第一页没有游标条件
    expect(JSON.stringify(call.where.AND)).not.toContain("lastPostAt: { lt:");
  });

  it("第二页:携带上一页游标,追加 lastPostAt/id 复合条件", async () => {
    const now = Date.now();
    const rows = [makeThread("thA", "A", new Date(now - 60_000))];
    findMany.mockResolvedValueOnce(rows);

    const cursor = encodeCursor({ t: new Date(now - 5 * 60_000).toISOString(), id: "th5" });
    const r = await searchThreads("帖", undefined, decodeCursor(cursor), 20);

    expect(r.items).toHaveLength(1);
    expect(r.nextCursor).toBeNull(); // 没有更多
    const call = findMany.mock.calls[0]![0] as { where: { AND: unknown[] } };
    const cond = JSON.stringify(call.where.AND[1]);
    expect(cond).toContain('"lt"');
    expect(cond).toContain('"th5"');
    // 第二页不再查置顶
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("限定版块时把 boardId 放进过滤条件", async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await searchThreads("x", "board-1", null, 20);
    const call = findMany.mock.calls[0]![0] as { where: { boardId?: string } };
    expect(call.where.boardId).toBe("board-1");
  });

  it("编译损坏的游标按第一页处理", async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const r = await searchThreads("x", undefined, decodeCursor("!!not-base64!!"), 20);
    expect(r.items).toEqual([]);
    expect(r.nextCursor).toBeNull();
  });
});

describe("searchPosts 游标与摘录", () => {
  beforeEach(() => findMany.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("按 createdAt 倒序翻页,excerpt 由服务端截好且带高亮关键词", async () => {
    const now = Date.now();
    const rows = Array.from({ length: 21 }, (_, i) =>
      makePost(`p${i}`, `第 ${i} 条回复里埋了 SearchHit 关键词`, new Date(now - i * 60_000)),
    );
    findMany.mockResolvedValueOnce(rows);

    const r = await searchPosts("SearchHit", undefined, null, 20);
    expect(r.items).toHaveLength(20);
    expect(r.nextCursor).toBeTruthy();
    expect(r.items[0]!.excerpt).toContain("SearchHit");
    expect(r.items[0]!.threadTitle).toBe("被搜索的主题");
    expect(r.items[0]!.boardSlug).toBe("general");
  });

  it("最后一页 nextCursor 为 null,并映射 id/楼层链接信息", async () => {
    const now = Date.now();
    findMany.mockResolvedValueOnce([makePost("p1", "只有一条 TargetWord", new Date(now))]);

    const r = await searchPosts("TargetWord", undefined, null, 20);
    expect(r.items).toHaveLength(1);
    expect(r.nextCursor).toBeNull();
    expect(r.items[0]!.id).toBe("p1");
    expect(r.items[0]!.authorName).toBe("bob");
  });

  it("限定版块时通过 thread.boardId 过滤", async () => {
    findMany.mockResolvedValueOnce([]);
    await searchPosts("x", "board-9", null, 20);
    const call = findMany.mock.calls[0]![0] as { where: { thread?: { boardId: string } } };
    expect(call.where.thread?.boardId).toBe("board-9");
  });
});

describe("游标编解码", () => {
  it("encode/decode 往返一致", () => {
    const c = { t: new Date().toISOString(), id: "abc123" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("decode 拒绝非法输入", () => {
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("!!!")).toBeNull();
    expect(decodeCursor(encodeCursor({ t: 1 as unknown as string, id: "x" }))).toBeNull();
  });
});