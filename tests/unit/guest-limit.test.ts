import { describe, expect, it } from "vitest";
import {
  buildGuestCookie,
  gateDecision,
  guestSettingsSchema,
  isFreshRepeat,
  parseGuestCookie,
  DEFAULT_GUEST_CONFIG,
} from "@/lib/guest-limit";

const TODAY = "2026-09-12";

describe("游客试读额度", () => {
  it("默认关闭", () => {
    expect(DEFAULT_GUEST_CONFIG).toEqual({ threadLimit: 0 });
    // limit<=0 永不拦截
    expect(gateDecision(0, 999).gated).toBe(false);
  });

  it("判定：第 N 次可看，第 N+1 次拦", () => {
    expect(gateDecision(5, 5)).toEqual({ gated: false, remaining: 0, limit: 5, count: 5 });
    expect(gateDecision(5, 6)).toEqual({ gated: true, remaining: 0, limit: 5, count: 6 });
    expect(gateDecision(5, 3).remaining).toBe(2);
  });

  it("cookie 解析：过期/非法归零", () => {
    expect(parseGuestCookie(null, TODAY)).toEqual({ count: 0, lastThreadId: "", lastTs: 0 });
    expect(parseGuestCookie("", TODAY).count).toBe(0);
    // 跨天归零
    expect(parseGuestCookie("2026-09-11.7.t1.123", TODAY).count).toBe(0);
    // 非法归零
    expect(parseGuestCookie("xxx", TODAY).count).toBe(0);
    expect(parseGuestCookie(`${TODAY}.-1.t1.5`, TODAY).count).toBe(0);
    const ok = parseGuestCookie(`${TODAY}.7.abc123.1700000000`, TODAY);
    expect(ok).toEqual({ count: 7, lastThreadId: "abc123", lastTs: 1700000000 });
    // roundtrip
    expect(parseGuestCookie(buildGuestCookie(TODAY, ok), TODAY)).toEqual(ok);
  });

  it("同主题 5 分钟内不重复计", () => {
    const now = 1700000000;
    expect(isFreshRepeat({ count: 3, lastThreadId: "t1", lastTs: now - 60 }, "t1", now)).toBe(true);
    expect(isFreshRepeat({ count: 3, lastThreadId: "t1", lastTs: now - 301 }, "t1", now)).toBe(false);
    expect(isFreshRepeat({ count: 3, lastThreadId: "t2", lastTs: now - 10 }, "t1", now)).toBe(false);
    expect(isFreshRepeat({ count: 0, lastThreadId: "", lastTs: 0 }, "t1", now)).toBe(false);
  });

  it("后台表单校验", () => {
    expect(guestSettingsSchema.safeParse({ guestThreadLimit: "10" }).data).toEqual({ guestThreadLimit: 10 });
    expect(guestSettingsSchema.safeParse({ guestThreadLimit: 0 }).success).toBe(true);
    expect(guestSettingsSchema.safeParse({ guestThreadLimit: -1 }).success).toBe(false);
    expect(guestSettingsSchema.safeParse({ guestThreadLimit: 10001 }).success).toBe(false);
    expect(guestSettingsSchema.safeParse({}).success).toBe(false);
  });
});
