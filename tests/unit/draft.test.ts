import { describe, expect, it } from "vitest";
import {
  clearDraft,
  draftKey,
  findFloorLabel,
  listKeys,
  loadDraft,
  loadReadPos,
  readPosKey,
  saveDraft,
  saveReadPos,
  scanDrafts,
} from "@/lib/draft";

function fakeStore(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

describe("草稿键", () => {
  it("按场景隔离", () => {
    expect(draftKey("reply", "t1", "alice")).toBe("sg:draft:alice:reply:t1");
    expect(draftKey("new", "tech", "alice")).toBe("sg:draft:alice:new:tech");
    expect(draftKey("msg", "bob", "alice")).toBe("sg:draft:alice:msg:bob");
    expect(draftKey("newtitle", "tech", "alice")).toBe("sg:draft:alice:newtitle:tech");
    expect(draftKey("msg", "bob", "alice")).not.toBe(draftKey("msg", "bob", "carol"));
  });

  it("阅读位置键", () => {
    expect(readPosKey("t1")).toBe("sg:readpos:t1");
  });
});

describe("草稿存取", () => {
  it("存了能取出", () => {
    const s = fakeStore();
    saveDraft(s, "k", "hello");
    expect(loadDraft(s, "k")).toBe("hello");
  });

  it("空文本视为清除", () => {
    const s = fakeStore();
    saveDraft(s, "k", "x");
    saveDraft(s, "k", "");
    expect(loadDraft(s, "k")).toBe("");
    expect(s.raw.has("k")).toBe(false);
  });

  it("clearDraft 清除", () => {
    const s = fakeStore();
    saveDraft(s, "k", "x");
    clearDraft(s, "k");
    expect(loadDraft(s, "k")).toBe("");
  });

  it("脏数据不炸,返回空", () => {
    const s = fakeStore({ k: "not-json{{{" });
    expect(loadDraft(s, "k")).toBe("");
  });

  it("过期草稿(7天)自动丢弃", () => {
    const old = JSON.stringify({ text: "old", at: Date.now() - 8 * 24 * 60 * 60 * 1000 });
    const s = fakeStore({ k: old });
    expect(loadDraft(s, "k")).toBe("");
    expect(s.raw.has("k")).toBe(false);
  });

  it("store 为空不炸", () => {
    expect(loadDraft(null, "k")).toBe("");
    expect(() => saveDraft(null, "k", "x")).not.toThrow();
    expect(() => clearDraft(null, "k")).not.toThrow();
  });
});

describe("阅读位置", () => {
  it("存取往返", () => {
    const s = fakeStore();
    saveReadPos(s, "t1", { postId: "p9", floor: "#9" });
    expect(loadReadPos(s, "t1")).toMatchObject({ postId: "p9", floor: "#9" });
  });

  it("floor 可为空", () => {
    const s = fakeStore();
    saveReadPos(s, "t1", { postId: "p9", floor: null });
    expect(loadReadPos(s, "t1")).toMatchObject({ postId: "p9", floor: null });
  });

  it("过期位置(30天)丢弃", () => {
    const old = JSON.stringify({ postId: "p1", floor: "#1", at: Date.now() - 31 * 24 * 60 * 60 * 1000 });
    const s = fakeStore({ [readPosKey("t1")]: old });
    expect(loadReadPos(s, "t1")).toBeNull();
  });

  it("脏数据返回 null", () => {
    const s = fakeStore({ [readPosKey("t1")]: "garbage" });
    expect(loadReadPos(s, "t1")).toBeNull();
    expect(loadReadPos(null, "t1")).toBeNull();
  });
});

describe("楼层号解析", () => {
  it("从 span 文本里抠 #N", () => {
    expect(findFloorLabel(["楼主", "#12", "12:00"])).toBe("#12");
    expect(findFloorLabel(["没有楼层"])).toBeNull();
    expect(findFloorLabel([])).toBeNull();
  });
});

describe("草稿箱扫描 scanDrafts / listKeys", () => {
  function storeWithKeys(seed: Record<string, string>) {
    const s = fakeStore(seed);
    return {
      ...s,
      get length() {
        return s.raw.size;
      },
      key: (i: number) => [...s.raw.keys()][i] ?? null,
    };
  }

  const at = Date.now();

  it("按用户隔离,只扫自己的草稿", () => {
    const s = storeWithKeys({
      "sg:draft:alice:reply:t1": JSON.stringify({ text: "回复内容", at }),
      "sg:draft:bob:reply:t1": JSON.stringify({ text: "别人的", at }),
      "sg:readpos:t1": JSON.stringify({ postId: "p1", at }),
    });
    const items = scanDrafts(s, "alice");
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("reply");
    expect(items[0]!.id).toBe("t1");
    expect(items[0]!.text).toBe("回复内容");
  });

  it("新主题正文 + 标题合并成一条", () => {
    const s = storeWithKeys({
      "sg:draft:alice:new:tech": JSON.stringify({ text: "正文", at: at - 1000 }),
      "sg:draft:alice:newtitle:tech": JSON.stringify({ text: "标题", at }),
    });
    const items = scanDrafts(s, "alice");
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("new");
    expect(items[0]!.text).toBe("正文");
    expect(items[0]!.titleText).toBe("标题");
    expect(items[0]!.keys).toHaveLength(2);
    expect(items[0]!.at).toBe(at);
  });

  it("按更新时间倒序", () => {
    const s = storeWithKeys({
      "sg:draft:alice:reply:t1": JSON.stringify({ text: "旧", at: at - 5000 }),
      "sg:draft:alice:msg:bob": JSON.stringify({ text: "新", at }),
    });
    const items = scanDrafts(s, "alice");
    expect(items.map((i) => i.id)).toEqual(["bob", "t1"]);
  });

  it("过期草稿顺手清掉", () => {
    const old = JSON.stringify({ text: "很久以前", at: at - 8 * 24 * 60 * 60 * 1000 });
    const s = storeWithKeys({ "sg:draft:alice:reply:t1": old });
    expect(scanDrafts(s, "alice", at)).toHaveLength(0);
    expect(s.raw.has("sg:draft:alice:reply:t1")).toBe(false);
  });

  it("脏数据/空文本/未知 kind 忽略", () => {
    const s = storeWithKeys({
      "sg:draft:alice:reply:t1": "garbage",
      "sg:draft:alice:reply:t2": JSON.stringify({ text: "", at }),
      "sg:draft:alice:weird:t3": JSON.stringify({ text: "x", at }),
      "sg:draft:alice:reply": JSON.stringify({ text: "x", at }),
    });
    expect(scanDrafts(s, "alice")).toHaveLength(0);
  });

  it("store 不支持枚举时返回空数组", () => {
    expect(scanDrafts(fakeStore({ "sg:draft:alice:reply:t1": JSON.stringify({ text: "x", at }) }), "alice")).toEqual([]);
    expect(scanDrafts(null, "alice")).toEqual([]);
    expect(listKeys(null)).toEqual([]);
  });
});
