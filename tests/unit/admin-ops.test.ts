import { describe, expect, it } from "vitest";
import { DESTRUCTIVE_ACTIONS, MAX_ADMIN_ACTIONS, adminActionSchema, checkDestructiveAck } from "@/lib/admin-ops";

function parse(input: unknown) {
  return adminActionSchema.safeParse(input);
}

describe("adminActionSchema 管理动作解析", () => {
  it("接受版块/主题/用户/公告等合法动作", () => {
    expect(parse({ type: "create_board", slug: "novel", name: "小说" }).success).toBe(true);
    expect(parse({ type: "delete_thread", threadId: "t1" }).success).toBe(true);
    expect(parse({ type: "set_user_role", username: "alice", role: "ADMIN" }).success).toBe(true);
    expect(parse({ type: "broadcast_announcement", title: "维护通知" }).success).toBe(true);
    expect(parse({ type: "move_thread", threadId: "t1", boardSlug: "tech", categoryName: null }).success).toBe(true);
  });

  it("拒绝非法 slug（大写/空格/下划线）", () => {
    expect(parse({ type: "create_board", slug: "Novel", name: "小说" }).success).toBe(false);
    expect(parse({ type: "create_board", slug: "no vel", name: "小说" }).success).toBe(false);
    expect(parse({ type: "create_board", slug: "no_vel", name: "小说" }).success).toBe(false);
    expect(parse({ type: "create_board", slug: "novel-2", name: "小说" }).success).toBe(true);
  });

  it("拒绝未知动作类型与缺失必填字段", () => {
    expect(parse({ type: "drop_database" }).success).toBe(false);
    expect(parse({ type: "ban_user", username: "alice" }).success).toBe(false);
    expect(parse({ type: "set_user_role", username: "alice", role: "SUPER" }).success).toBe(false);
  });

  it("拒绝越界参数（天数/积分/分类名长度）", () => {
    expect(parse({ type: "ban_user", username: "alice", reason: "广告", days: 0 }).success).toBe(false);
    expect(parse({ type: "ban_user", username: "alice", reason: "广告", days: 99999 }).success).toBe(false);
    expect(parse({ type: "add_points", username: "alice", points: 100001 }).success).toBe(false);
    expect(parse({ type: "create_category", boardSlug: "novel", name: "x".repeat(21) }).success).toBe(false);
  });

  it("单次动作上限为 20", () => {
    expect(MAX_ADMIN_ACTIONS).toBe(20);
  });
});

describe("checkDestructiveAck 不可逆动作二次确认", () => {
  const removeBoard = { type: "delete_board", boardSlug: "novel" } as const;
  const pinThread = { type: "set_thread_pin", threadId: "t1", pinned: true } as const;

  it("全是低风险动作时不需要 acknowledge", () => {
    expect(checkDestructiveAck([pinThread])).toEqual({ ok: true });
    expect(checkDestructiveAck([{ type: "create_board", slug: "novel", name: "小说" }])).toEqual({ ok: true });
  });

  it("含不可逆动作且没确认时整批拒绝，并列出需要的动作", () => {
    const res = checkDestructiveAck([pinThread, removeBoard]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.required).toEqual(["delete_board"]);
      expect(res.error).toContain("IRREVERSIBLE");
    }
  });

  it("acknowledge=IRREVERSIBLE 时放行", () => {
    expect(checkDestructiveAck([removeBoard], "IRREVERSIBLE")).toEqual({ ok: true });
  });

  it("acknowledge 值不对时仍拒绝", () => {
    expect(checkDestructiveAck([removeBoard], "yes").ok).toBe(false);
    expect(checkDestructiveAck([removeBoard], "APPLY").ok).toBe(false);
  });

  it("不可逆动作集合覆盖关键高危操作", () => {
    for (const t of ["delete_board", "delete_thread", "delete_post", "ban_user", "set_user_role", "reset_user_password", "merge_board", "clear_board"]) {
      expect(DESTRUCTIVE_ACTIONS.has(t as never)).toBe(true);
    }
    expect(DESTRUCTIVE_ACTIONS.has("set_thread_pin" as never)).toBe(false);
    expect(DESTRUCTIVE_ACTIONS.has("broadcast_announcement" as never)).toBe(false);
  });
});
