import { describe, expect, it } from "vitest";
import { checkinPoints, CHECKIN_BASE_POINTS, CHECKIN_STREAK_BONUS } from "@/lib/checkin";

describe("签到积分", () => {
  it("第 1 天拿基础分", () => {
    expect(checkinPoints(1)).toBe(CHECKIN_BASE_POINTS);
  });

  it("每满 7 天多一份连续奖励", () => {
    expect(checkinPoints(7)).toBe(CHECKIN_BASE_POINTS);
    expect(checkinPoints(8)).toBe(CHECKIN_BASE_POINTS + CHECKIN_STREAK_BONUS);
    expect(checkinPoints(14)).toBe(CHECKIN_BASE_POINTS + CHECKIN_STREAK_BONUS);
    expect(checkinPoints(15)).toBe(CHECKIN_BASE_POINTS + CHECKIN_STREAK_BONUS * 2);
    expect(checkinPoints(29)).toBe(CHECKIN_BASE_POINTS + CHECKIN_STREAK_BONUS * 4);
  });

  it("异常输入按第 1 天处理", () => {
    expect(checkinPoints(0)).toBe(CHECKIN_BASE_POINTS);
    expect(checkinPoints(-5)).toBe(CHECKIN_BASE_POINTS);
  });
});
