/**
 * 纯函数权限层:不碰数据库、不碰请求,方便单测。
 * 页面和 server action 都只允许通过这里判断权限。
 */

export interface UserLike {
  id: string;
  role: "USER" | "ADMIN";
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
  opts: { isFirstPost: boolean; threadLocked: boolean },
): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  // 普通用户可以删自己的非首帖;首帖=主题本体,删除是管理员权限
  return post.authorId === user.id && !opts.isFirstPost && !opts.threadLocked;
}

export function canModerate(user: UserLike | null): boolean {
  return isAdmin(user);
}
