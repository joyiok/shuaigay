import { describe, expect, it } from "vitest";
import { buildBoardTree, groupBoards } from "@/lib/boards";

describe("版块分组/子树", () => {
  it("默认分区置顶，组内按 order", () => {
    const groups = groupBoards([
      { id: "1", slug: "b", name: "B", group: "兴趣", order: 2 },
      { id: "2", slug: "a", name: "A", order: 1 },
      { id: "3", slug: "c", name: "C", group: "兴趣", order: 1 },
    ]);
    expect(groups[0]!.group).toBe("默认分区");
    expect(groups[1]!.boards.map((b) => b.slug)).toEqual(["c", "b"]);
  });

  it("一层子树：子版块挂父，孤儿回根", () => {
    const tree = buildBoardTree([
      { id: "p", slug: "p", name: "父", order: 0 },
      { id: "c1", slug: "c1", name: "子1", parentId: "p", order: 1 },
      { id: "orphan", slug: "o", name: "孤儿", parentId: "gone", order: 2 },
    ]);
    expect(tree.map((t) => t.slug)).toEqual(["p", "o"]);
    expect(tree[0]!.children.map((c) => c.slug)).toEqual(["c1"]);
  });
});
