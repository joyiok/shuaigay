import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- mocks ----
const mockFindUniqueThread = vi.hoisted(() => vi.fn());
const mockFindUniquePost = vi.hoisted(() => vi.fn());
const mockReportFindFirst = vi.hoisted(() => vi.fn());
const mockReportFindMany = vi.hoisted(() => vi.fn());
const mockReportCreate = vi.hoisted(() => vi.fn());
const mockReportUpdate = vi.hoisted(() => vi.fn());
const mockReportUpdateMany = vi.hoisted(() => vi.fn());
const mockReportFindUnique = vi.hoisted(() => vi.fn());
const mockThreadFindUniqueForReview = vi.hoisted(() => vi.fn());
const mockPostFindUniqueForReview = vi.hoisted(() => vi.fn());
const mockAttachmentFindMany = vi.hoisted(() => vi.fn());
const mockThreadDelete = vi.hoisted(() => vi.fn());
const mockPostDelete = vi.hoisted(() => vi.fn());
const mockNotificationCreate = vi.hoisted(() => vi.fn());
const mockStorageRemove = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    thread: {
      findUnique: mockFindUniqueThread,
      delete: mockThreadDelete,
    },
    post: {
      findUnique: mockFindUniquePost,
      delete: mockPostDelete,
    },
    report: {
      findFirst: mockReportFindFirst,
      findMany: mockReportFindMany,
      create: mockReportCreate,
      findUnique: mockReportFindUnique,
      update: mockReportUpdate,
      updateMany: mockReportUpdateMany,
    },
    attachment: {
      findMany: mockAttachmentFindMany,
    },
    notification: {
      create: mockNotificationCreate,
    },
  },
}));

vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: mockCheckRateLimit,
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ remove: mockStorageRemove }),
}));

// need to re-import after mocks
import { createReport, reviewReport, deleteThread, deletePost, settlePendingReports, notifyReporter } from "@/lib/moderation";

function resetMocks() {
  mockFindUniqueThread.mockReset();
  mockFindUniquePost.mockReset();
  mockReportFindFirst.mockReset();
  mockReportFindMany.mockReset();
  mockReportCreate.mockReset();
  mockReportUpdate.mockReset();
  mockReportUpdateMany.mockReset();
  mockReportFindUnique.mockReset();
  mockThreadFindUniqueForReview.mockReset();
  mockPostFindUniqueForReview.mockReset();
  mockAttachmentFindMany.mockReset();
  mockThreadDelete.mockReset();
  mockPostDelete.mockReset();
  mockNotificationCreate.mockReset();
  mockStorageRemove.mockReset();
  mockCheckRateLimit.mockReset();
}

describe("createReport 举报创建", () => {
  beforeEach(() => {
    resetMocks();
    mockCheckRateLimit.mockResolvedValue(true);
  });

  it("成功创建举报", async () => {
    mockFindUniqueThread.mockResolvedValue({ authorId: "author1" });
    mockReportFindFirst.mockResolvedValue(null);
    mockReportCreate.mockResolvedValue({ id: "r1" });

    const r = await createReport("reporter1", "thread", "t1", "违规内容详细说明");
    expect(r.ok).toBe(true);
    expect(mockReportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ reporterId: "reporter1", targetType: "thread", targetId: "t1" }),
    });
  });

  it("理由过短 (<5) 拒绝", async () => {
    const r = await createReport("u1", "thread", "t1", "短");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(r.error).toContain("5~500");
  });

  it("理由过长 (>500) 拒绝", async () => {
    const r = await createReport("u1", "thread", "t1", "a".repeat(501));
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it("包含敏感词拒绝", async () => {
    const r = await createReport("u1", "thread", "t1", "这里有傻逼内容需要举报违规");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("敏感词");
    expect(r.status).toBe(400);
  });

  it("不支持的 targetType", async () => {
    const r = await createReport("u1", "user", "x1", "违规内容详细说明");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it("目标不存在返回 404", async () => {
    mockFindUniqueThread.mockResolvedValue(null);
    const r = await createReport("u1", "thread", "nope", "违规内容详细说明");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
    expect(r.error).toContain("不存在");
  });

  it("不能举报自己", async () => {
    mockFindUniquePost.mockResolvedValue({ authorId: "me" });
    const r = await createReport("me", "post", "p1", "违规内容详细说明一下");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("不能举报自己");
  });

  it("限流触发返回 429", async () => {
    mockFindUniqueThread.mockResolvedValue({ authorId: "author1" });
    mockCheckRateLimit.mockResolvedValue(false);
    const r = await createReport("u1", "thread", "t1", "违规内容详细说明");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(429);
    expect(r.error).toContain("频繁");
  });

  it("重复 pending 举报返回 409", async () => {
    mockFindUniqueThread.mockResolvedValue({ authorId: "author1" });
    mockReportFindFirst.mockResolvedValue({ id: "existing" });
    const r = await createReport("u1", "thread", "t1", "违规内容详细说明");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.error).toContain("审核队列");
  });

  it("post 类型的举报走 post 查询", async () => {
    mockFindUniquePost.mockResolvedValue({ authorId: "author2" });
    mockReportFindFirst.mockResolvedValue(null);
    mockReportCreate.mockResolvedValue({ id: "r2" });
    const r = await createReport("reporter1", "post", "p1", "违规内容详细说明一下");
    expect(r.ok).toBe(true);
    expect(mockFindUniquePost).toHaveBeenCalled();
    expect(mockFindUniqueThread).not.toHaveBeenCalled();
  });

  it("边界长度 5 刚好通过", async () => {
    mockFindUniqueThread.mockResolvedValue({ authorId: "author1" });
    mockReportFindFirst.mockResolvedValue(null);
    mockReportCreate.mockResolvedValue({ id: "r3" });
    const r = await createReport("u1", "thread", "t1", "12345");
    expect(r.ok).toBe(true);
  });

  it("敏感词大小写不敏感 (nmsl)", async () => {
    const r = await createReport("u1", "thread", "t1", "内容包含 NMSL 辱骂");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("敏感词");
  });
});

describe("reviewReport 审核", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("举报不存在返回 404", async () => {
    mockReportFindUnique.mockResolvedValue(null);
    const r = await reviewReport("nope", "ignore");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });

  it("已处理的举报返回 409", async () => {
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "resolved", targetType: "thread", targetId: "t1", reporterId: "u1" });
    const r = await reviewReport("r1", "ignore");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
  });

  it("ignore 处理：更新为 resolved 并通知", async () => {
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "pending", targetType: "thread", targetId: "t1", reporterId: "u1" });
    mockReportUpdate.mockResolvedValue({});
    mockNotificationCreate.mockResolvedValue({});
    const r = await reviewReport("r1", "ignore");
    expect(r.ok).toBe(true);
    expect(mockReportUpdate).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "resolved" } });
    expect(mockNotificationCreate).toHaveBeenCalled();
  });

  it("reject 处理：更新为 rejected 并通知", async () => {
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "pending", targetType: "post", targetId: "p1", reporterId: "u1" });
    mockReportUpdate.mockResolvedValue({});
    mockNotificationCreate.mockResolvedValue({});
    const r = await reviewReport("r1", "reject");
    expect(r.ok).toBe(true);
    expect(mockReportUpdate).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "rejected" } });
  });

  it("delete_thread 目标存在时删除并结案", async () => {
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "pending", targetType: "thread", targetId: "t1", reporterId: "u1" });
    // reviewReport 内部会先查 target 存在性，再调用 deleteThread
    // deleteThread 内部会查附件、删线程、结案通知
    // 需要 mock 整个 deleteThread 链路
    // 简化：让 findUnique 返回目标，然后 mock 附件与报告
    // 由于 deleteThread 是真实函数，会调用 db.* ，需把相关 mock 设好
    // thread 存在
    // 需要让 moderation 内部的 findUnique (thread) 返回有值
    // 实际上 reviewReport 用 db.thread.findUnique / db.post.findUnique 直接查，这里我们 mock 的是同一个 mockFindUniqueThread
    // 所以让它返回存在
    mockFindUniqueThread.mockResolvedValue({ id: "t1" });
    mockAttachmentFindMany.mockResolvedValue([]);
    mockThreadDelete.mockResolvedValue({});
    mockReportFindMany.mockResolvedValue([{ id: "r1", reporterId: "u1" }]);
    mockReportUpdateMany.mockResolvedValue({});
    mockNotificationCreate.mockResolvedValue({});

    // 但 reviewReport 首次查 report 用 mockReportFindUnique，目标存在性用 mockFindUniqueThread
    // 已经设好，接下来调用 deleteThread 会再次用 mockAttachmentFindMany 等
    const r = await reviewReport("r1", "delete_thread");
    expect(r.ok).toBe(true);
    expect(mockThreadDelete).toHaveBeenCalledWith({ where: { id: "t1" } });
  });

  it("delete_post 目标存在时删除", async () => {
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "pending", targetType: "post", targetId: "p1", reporterId: "u1" });
    mockFindUniquePost.mockResolvedValue({ id: "p1" });
    mockAttachmentFindMany.mockResolvedValue([{ storedName: "2025/abc.jpg" }]);
    mockPostDelete.mockResolvedValue({});
    mockReportFindMany.mockResolvedValue([{ id: "r1", reporterId: "u1" }]);
    mockReportUpdateMany.mockResolvedValue({});
    mockNotificationCreate.mockResolvedValue({});
    mockStorageRemove.mockResolvedValue(undefined);

    const r = await reviewReport("r1", "delete_post");
    expect(r.ok).toBe(true);
    expect(mockPostDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(mockStorageRemove).toHaveBeenCalledWith("2025/abc.jpg");
  });

  it("delete_thread 目标已不存在时只结案并通知已不存在", async () => {
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "pending", targetType: "thread", targetId: "t1", reporterId: "u1" });
    mockFindUniqueThread.mockResolvedValue(null);
    mockReportUpdate.mockResolvedValue({});
    mockNotificationCreate.mockResolvedValue({});

    const r = await reviewReport("r1", "delete_thread");
    expect(r.ok).toBe(true);
    expect(mockReportUpdate).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "resolved" } });
    // 通知内容包含“已不存在”
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: expect.stringContaining("已不存在") }) }),
    );
  });

  it("未知操作返回 400", async () => {
    mockReportFindUnique.mockResolvedValue({ id: "r1", status: "pending", targetType: "thread", targetId: "t1", reporterId: "u1" });
    const r = await reviewReport("r1", "unknown" as any);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });
});

describe("settlePendingReports / notifyReporter / deleteThread helpers", () => {
  beforeEach(resetMocks);

  it("settlePendingReports 无 pending 时直接返回", async () => {
    mockReportFindMany.mockResolvedValue([]);
    await settlePendingReports("thread", "t1", true);
    expect(mockReportUpdateMany).not.toHaveBeenCalled();
  });

  it("settlePendingReports 有 pending 时更新并通知", async () => {
    mockReportFindMany.mockResolvedValue([
      { id: "r1", reporterId: "u1" },
      { id: "r2", reporterId: "u2" },
    ]);
    mockReportUpdateMany.mockResolvedValue({});
    mockNotificationCreate.mockResolvedValue({});
    await settlePendingReports("post", "p1", true);
    expect(mockReportUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["r1", "r2"] } },
      data: { status: "resolved" },
    });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(2);
  });

  it("settlePendingReports 静默模式不通知", async () => {
    mockReportFindMany.mockResolvedValue([{ id: "r1", reporterId: "u1" }]);
    mockReportUpdateMany.mockResolvedValue({});
    await settlePendingReports("thread", "t1", false);
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it("notifyReporter 创建通知", async () => {
    mockNotificationCreate.mockResolvedValue({});
    await notifyReporter("u1", "标题", "内容");
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: { userId: "u1", type: "report", title: "标题", body: "内容" },
    });
  });

  it("deleteThread 清理附件并结案", async () => {
    mockAttachmentFindMany.mockResolvedValue([{ storedName: "a.jpg" }, { storedName: "b.png" }]);
    mockThreadDelete.mockResolvedValue({});
    mockReportFindMany.mockResolvedValue([]);
    mockStorageRemove.mockResolvedValue(undefined);
    await deleteThread("t1");
    expect(mockThreadDelete).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(mockStorageRemove).toHaveBeenCalledTimes(2);
  });

  it("deletePost 无附件时仍可删除", async () => {
    mockAttachmentFindMany.mockResolvedValue([]);
    mockPostDelete.mockResolvedValue({});
    mockReportFindMany.mockResolvedValue([]);
    await deletePost("p1");
    expect(mockPostDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });
});
