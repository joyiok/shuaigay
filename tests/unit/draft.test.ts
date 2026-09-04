import { describe, expect, it } from "vitest";
import {
  clearDraft,
  draftKey,
  findFloorLabel,
  loadDraft,
  loadReadPos,
  readPosKey,
  saveDraft,
  saveReadPos,
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
    expect(draftKey("reply", "t1")).toBe("sg:draft:reply:t1");
    expect(draftKey("new", "tech")).toBe("sg:draft:new:tech");
    expect(draftKey("msg", "bob")).toBe("sg:draft:msg:bob");
    expect(draftKey("newtitle", "tech")).toBe("sg:draft:newtitle:tech");
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
