import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "@/lib/cursor";

describe("游标编解码", () => {
  it("往返一致", () => {
    const c = { t: "2026-08-29T00:00:00.000Z", id: "cm123abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("伪造、损坏、空的游标一律返回 null(当第一页处理)", () => {
    expect(decodeCursor("garbage!!")).toBeNull();
    expect(
      decodeCursor(Buffer.from('{"t":1}').toString("base64url")),
    ).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });
});
