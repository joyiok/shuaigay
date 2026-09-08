/**
 * 通知偏好:纯函数集中在这里,便于单测覆盖「谁该收到哪类通知」。
 *
 * 分组口径(与 /settings 页面一一对应):
 * - reply   : 回复 / 提及 / 收藏主题有新回复 / 楼层被赞
 * - follow  : 被关注 / 获得勋章 / 主题被加精
 * - 其余(待审 pending、举报 report、公告 system 等)属于运营类通知,始终送达。
 *
 * 说明:过滤器直接调用 lib/db,不做依赖注入——server action 的事务客户端(tx)
 * 也有 user.findMany,结构一致,所以两种调用都能用。
 */
import { db as defaultDb } from "./db";

export type NotificationKind =
  | "reply"
  | "mention"
  | "favorite"
  | "rate"
  | "follow"
  | "medal"
  | "digest"
  | "pending"
  | "report"
  | "system";

export type NotifyPrefKey = "reply" | "follow";

export interface NotifyPrefs {
  notifyReply: boolean;
  notifyFollow: boolean;
}

export const NOTIFY_PREF_KEYS: readonly NotifyPrefKey[] = ["reply", "follow"];

/** 页面文案用的分组定义:分组名 + 该组包含的通知类型 */
export const NOTIFY_GROUPS: readonly {
  key: NotifyPrefKey;
  label: string;
  description: string;
  types: readonly NotificationKind[];
}[] = [
  {
    key: "reply",
    label: "互动提醒",
    description: "有人回复你的主题、在帖子里 @你、赞了你的楼层，或你收藏的主题有新回复。",
    types: ["reply", "mention", "favorite", "rate"],
  },
  {
    key: "follow",
    label: "社交提醒",
    description: "有人关注你、你的主题被加精，或你获得新勋章。",
    types: ["follow", "medal", "digest"],
  },
];

const GROUP_BY_TYPE = new Map<NotificationKind, NotifyPrefKey>();
for (const g of NOTIFY_GROUPS) {
  for (const t of g.types) GROUP_BY_TYPE.set(t, g.key);
}

/** 未知类型按运营通知处理(始终送达),避免新通知类型被静默吞掉 */
export function groupForNotificationType(type: string): NotifyPrefKey | null {
  return GROUP_BY_TYPE.get(type as NotificationKind) ?? null;
}

/** 用户是否愿意接收该类站内通知 */
export function wantsNotification(prefs: NotifyPrefs, type: string): boolean {
  const group = groupForNotificationType(type);
  if (!group) return true;
  return prefs[group === "reply" ? "notifyReply" : "notifyFollow"];
}

/** 把复选框值解析成偏好;未勾选 = 关闭 */
export function prefsFromForm(input: { reply?: unknown; follow?: unknown }): NotifyPrefs {
  return {
    notifyReply: input.reply === "on" || input.reply === true,
    notifyFollow: input.follow === "on" || input.follow === true,
  };
}

export interface NotifyRowLike {
  userId: string;
  type: string;
}

/** 事务客户端与 PrismaClient 都满足的最小接口(参数用结构类型,避免绑定 Prisma 泛型) */
type PrefReader = {
  user: {
    findMany: (args: {
      where: { id: { in: string[] } };
      select: { id: true; notifyReply: true; notifyFollow: true };
    }) => Promise<{ id: string; notifyReply: boolean; notifyFollow: boolean }[]>;
  };
};

/**
 * 批量过滤:一次查出收件人偏好,去掉关闭了对应分组的收件人。
 * 查库失败时返回原样(宁可多发,不可漏发);查不到的用户(已注销)直接丢弃。
 */
export async function filterRowsByPreferences<T extends NotifyRowLike>(
  rows: readonly T[],
  reader: PrefReader = defaultDb as unknown as PrefReader,
): Promise<T[]> {
  if (rows.length === 0) return [];
  const needPrefs = rows.some((r) => groupForNotificationType(r.type) !== null);
  if (!needPrefs) return [...rows];

  const ids = [...new Set(rows.map((r) => r.userId))];
  let users: { id: string; notifyReply: boolean; notifyFollow: boolean }[];
  try {
    users = (await reader.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, notifyReply: true, notifyFollow: true },
    })) as { id: string; notifyReply: boolean; notifyFollow: boolean }[];
  } catch {
    return [...rows];
  }
  const prefsById = new Map(users.map((u) => [u.id, u]));
  return rows.filter((r) => {
    const prefs = prefsById.get(r.userId);
    if (!prefs) return false;
    return wantsNotification(prefs, r.type);
  });
}
