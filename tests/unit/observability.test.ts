import { describe, expect, it } from "vitest";
import { isVitalGood } from "@/lib/observability";

describe("可观测性：Web Vitals 良好阈值", () => {
  it("LCP 2.5s 为界", () => {
    expect(isVitalGood("LCP", 1800)).toBe(true);
    expect(isVitalGood("LCP", 2500)).toBe(true);
    expect(isVitalGood("LCP", 2501)).toBe(false);
  });

  it("INP 200ms / TTFB 800ms / FCP 1.8s", () => {
    expect(isVitalGood("INP", 190)).toBe(true);
    expect(isVitalGood("INP", 640)).toBe(false);
    expect(isVitalGood("TTFB", 350)).toBe(true);
    expect(isVitalGood("FCP", 2400)).toBe(false);
  });

  it("CLS 无量纲，阈值 0.1", () => {
    expect(isVitalGood("CLS", 0.05)).toBe(true);
    expect(isVitalGood("CLS", 0.3)).toBe(false);
  });

  it("不认识的指标一律不算良好（避免脏数据刷高良好率）", () => {
    expect(isVitalGood("FOO", 1)).toBe(false);
  });
});
