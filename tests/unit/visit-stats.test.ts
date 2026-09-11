import { describe, expect, it } from "vitest";
import { countryName, dayForDb, dayFromDb, dayKey, detectDevice, normalizePath, referrerHost } from "@/lib/visit-stats";

describe("流量统计：路径归一化", () => {
  it("主题/版块/用户主页按类型聚合，避免聚合表被每帖一行撑爆", () => {
    expect(normalizePath("/t/cmtvseoo601iop91hefdg46vk-社区发帖规范")).toBe("/t/[id]");
    expect(normalizePath("/c/novel")).toBe("/c/[slug]");
    expect(normalizePath("/u/reprint_novel")).toBe("/u/[username]");
    expect(normalizePath("/messages/admin")).toBe("/messages/[username]");
    expect(normalizePath("/_next/static/chunks/a.js")).toBe("/_next/*");
  });

  it("普通路径保持原样，去掉尾斜杠", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/hot/")).toBe("/hot");
    expect(normalizePath("/search")).toBe("/search");
  });

  it("超长路径截断，防止脏数据", () => {
    expect(normalizePath(`/${"a".repeat(300)}`).length).toBe(120);
  });
});

describe("流量统计：设备识别", () => {
  it("手机 UA 归为 mobile", () => {
    expect(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15")).toBe("mobile");
    expect(detectDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36")).toBe("mobile");
  });

  it("桌面 UA 归为 desktop", () => {
    expect(detectDevice("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36")).toBe("desktop");
  });

  it("爬虫/命令行归为 bot", () => {
    for (const ua of ["Googlebot/2.1", "curl/8.5.0", "python-requests/2.31", "HeadlessChrome/120", "UptimeRobot/2.0", ""]) {
      expect(detectDevice(ua)).toBe("bot");
    }
  });
});

describe("流量统计：来源域名", () => {
  it("取 host 并去掉 www", () => {
    expect(referrerHost("https://www.google.com/search?q=x")).toBe("google.com");
    expect(referrerHost("http://tieba.baidu.com/p/123")).toBe("tieba.baidu.com");
  });

  it("站内跳转与非法值不计来源", () => {
    expect(referrerHost("https://shuai.gay/t/abc")).toBe("");
    expect(referrerHost("https://www.shuai.gay/")).toBe("");
    expect(referrerHost("not a url")).toBe("");
    expect(referrerHost(null)).toBe("");
  });
});

describe("流量统计：站点时区分日（UTC+8）", () => {
  it("UTC 16:00 之后算第二天", () => {
    expect(dayKey(new Date("2026-09-10T15:59:00Z"))).toBe("2026-09-10");
    expect(dayKey(new Date("2026-09-10T16:00:00Z"))).toBe("2026-09-11");
  });

  it("@db.Date 列写入的是「站点当天」的 UTC 零点（否则今日 PV 会算到前一天）", () => {
    expect(dayForDb(new Date("2026-09-11T03:00:00Z")).toISOString()).toBe("2026-09-11T00:00:00.000Z");
    expect(dayForDb(new Date("2026-09-10T15:59:00Z")).toISOString()).toBe("2026-09-10T00:00:00.000Z");
    expect(dayForDb(new Date("2026-09-10T16:30:00Z")).toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });

  it("读回来能还原成站点日期串", () => {
    expect(dayFromDb(new Date("2026-09-11T00:00:00.000Z"))).toBe("2026-09-11");
  });
});

describe("流量统计：国家名", () => {
  it("常见地区有中文名，其余回退代码", () => {
    expect(countryName("CN")).toBe("中国大陆");
    expect(countryName("HK")).toBe("中国香港");
    expect(countryName("XX")).toBe("未知");
    expect(countryName("ZZ")).toBe("ZZ");
  });
});
