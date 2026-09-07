import { expect, it } from "vitest";
import { safeNext } from "@/lib/navigation";

it("站内返回地址保留查询参数，拒绝跨站和浏览器归一化绕过", () => {
  expect(safeNext("/search?q=test#results")).toBe("/search?q=test#results");
  for (const value of [null, "https://example.com", "//example.com", "/\\example.com", "/\n/example.com", "/\t/example.com"]) {
    expect(safeNext(value, "/")).toBe("/");
  }
});
