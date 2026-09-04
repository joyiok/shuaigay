import { describe, expect, it } from "vitest";
import {
  canCreateThread,
  canDeletePost,
  canGlobalPin,
  canModerate,
  canModerateBoard,
  canMoveThread,
  canReply,
  isAdmin,
} from "@/lib/permissions";

const user = { id: "u1", role: "USER" as const };
const admin = { id: "a1", role: "ADMIN" as const };

describe("权限判断", () => {
  it("匿名不能发帖和回复", () => {
    expect(canCreateThread(null)).toBe(false);
    expect(canReply(null, { authorId: "u1", locked: false })).toBe(false);
  });

  it("锁定主题普通用户不能回复,管理员可以", () => {
    const thread = { authorId: "u1", locked: true };
    expect(canReply(user, thread)).toBe(false);
    expect(canReply(admin, thread)).toBe(true);
  });

  it("未锁主题任何登录用户可以回复", () => {
    expect(canReply(user, { authorId: "u1", locked: false })).toBe(true);
  });

  it("普通用户不能删首帖,可以删自己的非首帖", () => {
    const post = { authorId: "u1" };
    expect(
      canDeletePost(user, post, { isFirstPost: true, threadLocked: false }),
    ).toBe(false);
    expect(
      canDeletePost(user, post, { isFirstPost: false, threadLocked: false }),
    ).toBe(true);
  });

  it("普通用户不能删别人的帖子", () => {
    expect(
      canDeletePost(user, { authorId: "other" }, { isFirstPost: false, threadLocked: false }),
    ).toBe(false);
  });

  it("管理员可以删任何帖子(含首帖)", () => {
    expect(
      canDeletePost(admin, { authorId: "u1" }, { isFirstPost: true, threadLocked: false }),
    ).toBe(true);
  });

  it("锁定主题下普通用户不能删自己的回帖", () => {
    expect(
      canDeletePost(user, { authorId: "u1" }, { isFirstPost: false, threadLocked: true }),
    ).toBe(false);
  });

  it("管理员识别", () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(user)).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(canModerate(admin)).toBe(true);
    expect(canModerate(user)).toBe(false);
  });

  it("版块管理:管理员全版块可管,版主只管自己版块", () => {
    expect(canModerateBoard(admin, false)).toBe(true);
    expect(canModerateBoard(admin, true)).toBe(true);
    expect(canModerateBoard(user, true)).toBe(true);
    expect(canModerateBoard(user, false)).toBe(false);
    expect(canModerateBoard(null, true)).toBe(false);
  });

  it("全局置顶仅管理员", () => {
    expect(canGlobalPin(admin)).toBe(true);
    expect(canGlobalPin(user)).toBe(false);
    expect(canGlobalPin(null)).toBe(false);
  });

  it("移动主题:管理员任意搬,版主需源+目标双版块权限", () => {
    expect(canMoveThread(admin, false, false)).toBe(true);
    expect(canMoveThread(user, true, true)).toBe(true);
    expect(canMoveThread(user, true, false)).toBe(false);
    expect(canMoveThread(user, false, true)).toBe(false);
    expect(canMoveThread(null, true, true)).toBe(false);
  });
});
