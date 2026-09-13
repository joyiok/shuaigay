import { describe, expect, it } from "vitest";
import { spamSignal } from "@/lib/approval";

describe("轻量反垃圾", () => {
  it("把多外链与重复刷屏送审，不误伤普通长文", () => {
    expect(spamSignal("https://a.test https://b.test https://c.test")).toBe("外链过多");
    expect(spamSignal("同一句广告内容\n同一句广告内容\n同一句广告内容\n同一句广告内容")).toBe("重复内容过多");
    expect(spamSignal("这是正常讨论，只有一个链接 https://example.com，也没有重复段落。")).toBeNull();
  });
});
