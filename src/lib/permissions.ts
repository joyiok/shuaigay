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

export function canReply(
  user: UserLike | null,
  thread: ThreadLike,
  opts?: { isModerator?: boolean; staff?: boolean },
): boolean {
  if (!user) return false;
  if (!thread.locked) return true;
  if (isAdmin(user)) return true;
  return !!(opts?.isModerator || opts?.staff);
}

/** 帖子编辑时间窗（分钟）：0 = 不限。默认 1440（24h），经 EDIT_WINDOW_MINUTES 可配 */
export function editWindowMinutes(): number {
  const raw = Number(process.env.EDIT_WINDOW_MINUTES ?? 1440);
  if (!Number.isFinite(raw) || raw < 0) return 1440;
  return Math.floor(raw);
}

export function isEditWindowOpen(createdAt: Date | string | number, now: number = Date.now()): boolean {
  const mins = editWindowMinutes();
  if (mins === 0) return true;
  const ts = new Date(createdAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return now - ts <= mins * 60 * 1000;
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

/** 编辑帖子:本人且主题未锁且在时间窗内；版主/管理员不受窗限制，锁帖也可改（删帖走 canDeletePost） */
export function canEditPost(
  user: UserLike | null,
  post: PostLike & { createdAt?: Date | string | number },
  opts: { threadLocked: boolean; staff?: boolean; isModerator?: boolean; now?: number },
): boolean {
  if (!user) return false;
  const staff = isAdmin(user) || !!opts.staff || !!opts.isModerator;
  if (staff) return true;
  if (opts.threadLocked) return false;
  if (post.authorId !== user.id) return false;
  if (post.createdAt !== undefined) return isEditWindowOpen(post.createdAt, opts.now);
  return true;
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
