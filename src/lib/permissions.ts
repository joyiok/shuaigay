/**
 * 纯函数权限层:不碰数据库、不碰请求,方便单测。
 * 页面和 server action 都只允许通过这里判断权限。
 */

export interface UserLike {
  id: string;
  role: "USER" | "ADMIN";
  points?: number;
}

export interface PostLike {
  authorId: string;
}

export interface ThreadLike {
  authorId: string;
  locked: boolean;
}

export function isAdmin(user: UserLike | null): boolean {
  return user?.role === "ADMIN";
}

export function canCreateThread(user: UserLike | null): boolean {
  return user !== null;
}

export function canReply(user: UserLike | null, thread: ThreadLike): boolean {
  if (!user) return false;
  if (!thread.locked) return true;
  return isAdmin(user);
}

export function canDeletePost(
  user: UserLike | null,
  post: PostLike,
  opts: { isFirstPost: boolean; threadLocked: boolean; staff?: boolean },
): boolean {
  if (!user) return false;
  if (isAdmin(user) || opts.staff) return true;
  // 普通用户可以删自己的非首帖;首帖=主题本体,删除是管理员/版主权限
  return post.authorId === user.id && !opts.isFirstPost && !opts.threadLocked;
}

/** 编辑帖子:本人且主题未锁;锁定的主题谁都不能改 */
export function canEditPost(
  user: UserLike | null,
  post: PostLike,
  opts: { threadLocked: boolean },
): boolean {
  if (!user) return false;
  return post.authorId === user.id && !opts.threadLocked;
}

export function canModerate(user: UserLike | null): boolean {
  return isAdmin(user);
}

/**
 * 版块级管理(置顶/加精/删帖等):管理员全版块可管,版主只管自己版块。
 * isModerator 由调用方查 BoardModerator 得出,此处只做纯判断。
 */
export function canModerateBoard(user: UserLike | null, isModerator: boolean): boolean {
  if (!user) return false;
  return isAdmin(user) || isModerator;
}

/** 全局置顶影响首页,仅管理员可操作 */
export function canGlobalPin(user: UserLike | null): boolean {
  return isAdmin(user);
}

/**
 * 移动主题:管理员任意搬;版主需同时是源版块与目标版块的版主,
 * 防止把自己版块的内容乱倒进别人的版块。
 */
export function canMoveThread(
  user: UserLike | null,
  isSourceModerator: boolean,
  isTargetModerator: boolean,
): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return isSourceModerator && isTargetModerator;
}

export function canPostLinkForPoints(points: number): boolean {
  // 需正式会员及以上
  return points >= 30;
}

export function maxUploadMBForPoints(points: number): number {
  return points >= 30 ? 20 : 5;
}
