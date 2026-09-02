/**
 * 通知计划:纯函数,把「谁该收到什么通知」从 server action 里抽出来,
 * 便于单测覆盖去重/排除自己的规则。
 */
export type NotifyKind = "reply" | "mention" | "rate" | "favorite" | "report";

export interface NotifyPlanItem {
  userId: string;
  kind: NotifyKind;
}

/**
 * 回复通知计划:
 * - 楼主(不是自己的话)收 reply 通知
 * - 被提及者(不是自己、且不是楼主)收 mention 通知
 * - 同一用户只通知一次,reply 优先级高于 mention
 */
export function planReplyNotifications(opts: {
  actorId: string;
  threadAuthorId: string;
  mentionedUserIds: readonly string[];
}): NotifyPlanItem[] {
  const out: NotifyPlanItem[] = [];
  const seen = new Set<string>();
  const add = (userId: string, kind: NotifyKind) => {
    if (userId === opts.actorId || seen.has(userId)) return;
    seen.add(userId);
    out.push({ userId, kind });
  };
  // 楼主先占位,被提及者补位时不会覆盖楼主的 reply 类型
  add(opts.threadAuthorId, "reply");
  for (const uid of opts.mentionedUserIds) add(uid, "mention");
  return out;
}

/** 新主题的提及通知:除自己外,每个被提及者一条 mention(去重) */
export function planMentionNotifications(opts: {
  actorId: string;
  mentionedUserIds: readonly string[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const uid of opts.mentionedUserIds) {
    if (uid === opts.actorId || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

/**
 * 收藏订阅提醒计划:主题有新回复时,通知「收藏了该主题的人」。
 * 已收到 reply/mention 通知的人(楼主、被提及者)不重复打扰。
 */
export function planFavoriteReplyNotifications(opts: {
  actorId: string;
  subscriberIds: readonly string[];
  alreadyNotifiedIds: ReadonlySet<string>;
}): string[] {
  const out: string[] = [];
  const seen = new Set(opts.alreadyNotifiedIds);
  for (const uid of opts.subscriberIds) {
    if (uid === opts.actorId || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

/** 通知正文:去空白截断 */
export function excerptForNotify(raw: string, max = 120): string {
  return raw.replace(/\s+/g, " ").slice(0, max);
}