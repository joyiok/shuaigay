import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/db", () => ({ db: { notification: mocks } }));
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));

import { GET as getNotifications } from "@/app/api/notifications/route";
import { GET as streamNotifications } from "@/app/api/notifications/stream/route";

describe("通知接口边界", () => {
  beforeEach(() => {
    mocks.count.mockReset().mockResolvedValue(0);
    mocks.findMany.mockReset().mockResolvedValue([]);
  });

  afterEach(() => vi.restoreAllMocks());

  it("未传 limit 时默认返回 20 条", async () => {
    await getNotifications(new NextRequest("http://localhost/api/notifications"));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
  });

  it("查询期间断开 SSE 不会向已关闭的流写入", async () => {
    let release!: (value: number) => void;
    mocks.count.mockReturnValueOnce(new Promise<number>((resolve) => { release = resolve; }));
    const abort = new AbortController();
    const response = await streamNotifications(new Request("http://localhost/api/notifications/stream", { signal: abort.signal }));
    const reader = response.body!.getReader();
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => unhandled.push(error);
    process.on("unhandledRejection", onUnhandled);

    try {
      abort.abort();
      await expect(reader.read()).resolves.toEqual({ value: undefined, done: true });
      release(1);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
