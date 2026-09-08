import { describe, expect, it } from "vitest";
import {
  NOTIFY_GROUPS,
  filterRowsByPreferences,
  groupForNotificationType,
  prefsFromForm,
  wantsNotification,
} from "@/lib/notifications";

describe("groupForNotificationType 通知分组", () => {
  it("互动类通知归到 reply 组", () => {
    for (const t of ["reply", "mention", "favorite", "rate"]) {
      expect(groupForNotificationType(t)).toBe("reply");
    }
  });

  it("社交类通知归到 follow 组", () => {
    for (const t of ["follow", "medal", "digest"]) {
      expect(groupForNotificationType(t)).toBe("follow");
    }
  });

  it("运营类与未知类型不归组(始终送达)", () => {
    for (const t of ["pending", "report", "system", "brand_new_type"]) {
      expect(groupForNotificationType(t)).toBeNull();
    }
  });

  it("分组定义与分组查询保持一致", () => {
    for (const g of NOTIFY_GROUPS) {
      for (const t of g.types) expect(groupForNotificationType(t)).toBe(g.key);
    }
  });
});

describe("wantsNotification 单条判定", () => {
  const on = { notifyReply: true, notifyFollow: true };
  const off = { notifyReply: false, notifyFollow: false };

  it("全开时都收", () => {
    expect(wantsNotification(on, "reply")).toBe(true);
    expect(wantsNotification(on, "follow")).toBe(true);
    expect(wantsNotification(on, "system")).toBe(true);
  });

  it("全关时互动/社交都不收,运营通知照收", () => {
    expect(wantsNotification(off, "reply")).toBe(false);
    expect(wantsNotification(off, "mention")).toBe(false);
    expect(wantsNotification(off, "favorite")).toBe(false);
    expect(wantsNotification(off, "rate")).toBe(false);
    expect(wantsNotification(off, "follow")).toBe(false);
    expect(wantsNotification(off, "medal")).toBe(false);
    expect(wantsNotification(off, "digest")).toBe(false);
    expect(wantsNotification(off, "pending")).toBe(true);
    expect(wantsNotification(off, "report")).toBe(true);
    expect(wantsNotification(off, "system")).toBe(true);
  });

  it("只关互动时社交仍收,反之亦然", () => {
    expect(wantsNotification({ notifyReply: false, notifyFollow: true }, "reply")).toBe(false);
    expect(wantsNotification({ notifyReply: false, notifyFollow: true }, "follow")).toBe(true);
    expect(wantsNotification({ notifyReply: true, notifyFollow: false }, "mention")).toBe(true);
    expect(wantsNotification({ notifyReply: true, notifyFollow: false }, "medal")).toBe(false);
  });
});

describe("prefsFromForm 表单解析", () => {
  it("勾选值为 on 时开启", () => {
    expect(prefsFromForm({ reply: "on", follow: "on" })).toEqual({ notifyReply: true, notifyFollow: true });
  });

  it("未勾选(undefined/null)时关闭", () => {
    expect(prefsFromForm({})).toEqual({ notifyReply: false, notifyFollow: false });
    expect(prefsFromForm({ reply: null, follow: null })).toEqual({ notifyReply: false, notifyFollow: false });
  });

  it("只勾一项时另一项关闭", () => {
    expect(prefsFromForm({ reply: "on" })).toEqual({ notifyReply: true, notifyFollow: false });
  });
});

/** 假 reader:模拟 Prisma 的 user.findMany */
function fakeReader(users: { id: string; notifyReply: boolean; notifyFollow: boolean }[]) {
  return {
    user: {
      findMany: async () => users,
    },
  };
}

describe("filterRowsByPreferences 批量过滤", () => {
  const rows = [
    { userId: "u1", type: "reply", title: "回复" },
    { userId: "u1", type: "follow", title: "关注" },
    { userId: "u2", type: "reply", title: "回复" },
    { userId: "u2", type: "pending", title: "待审" },
  ];

  it("空输入返回空数组", async () => {
    expect(await filterRowsByPreferences([])).toEqual([]);
  });

  it("按各自偏好逐条过滤,运营通知不受开关影响", async () => {
    const reader = fakeReader([
      { id: "u1", notifyReply: false, notifyFollow: true },
      { id: "u2", notifyReply: false, notifyFollow: false },
    ]);
    const kept = await filterRowsByPreferences(rows, reader);
    expect(kept.map((r) => `${r.userId}:${r.type}`)).toEqual(["u1:follow", "u2:pending"]);
  });

  it("全是运营通知时不查库", async () => {
    let called = 0;
    const reader = {
      user: {
        findMany: async () => {
          called++;
          return [];
        },
      },
    };
    const kept = await filterRowsByPreferences([{ userId: "u1", type: "system", title: "公告" }], reader);
    expect(kept).toHaveLength(1);
    expect(called).toBe(0);
  });

  it("收件人已不存在时丢弃(避免外键报错)", async () => {
    const kept = await filterRowsByPreferences(rows, fakeReader([{ id: "u1", notifyReply: true, notifyFollow: true }]));
    expect(kept.every((r) => r.userId === "u1")).toBe(true);
  });

  it("查库失败时返回原样,宁可多发不漏发", async () => {
    const reader = {
      user: {
        findMany: async () => {
          throw new Error("db down");
        },
      },
    };
    const kept = await filterRowsByPreferences(rows, reader);
    expect(kept).toHaveLength(rows.length);
  });

  it("同一用户多条只查一次偏好", async () => {
    let called = 0;
    const reader = {
      user: {
        findMany: async () => {
          called++;
          return [
            { id: "u1", notifyReply: true, notifyFollow: true },
            { id: "u2", notifyReply: true, notifyFollow: true },
          ];
        },
      },
    };
    await filterRowsByPreferences(rows, reader);
    expect(called).toBe(1);
  });
});
