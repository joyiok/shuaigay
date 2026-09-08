"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * 草稿箱：本地 localStorage 只存了 kind + id，展示标题需要回库解析。
 * 这里批量把草稿目标解析成可读标题与跳转地址，找不到的目标标记 missing。
 */

export type DraftKindName = "reply" | "new" | "newtitle" | "msg";

export interface DraftTargetInput {
  kind: string;
  id: string;
}

export interface DraftTargetMeta {
  kind: string;
  id: string;
  /** 列表主标题 */
  title: string;
  /** 次要说明（版块名 / 草稿类型） */
  subtitle: string;
  /** 继续写跳转地址；目标已删除时为 null */
  href: string | null;
  /** 目标主题/版块/用户已不存在 */
  missing: boolean;
}

const MAX_TARGETS = 100;

export async function resolveDraftTargets(inputs: DraftTargetInput[]): Promise<DraftTargetMeta[]> {
  const me = await getCurrentUser();
  if (!me) return [];
  const list = inputs
    .filter((i) => i && typeof i.kind === "string" && typeof i.id === "string" && i.id)
    .slice(0, MAX_TARGETS);

  const threadIds = [...new Set(list.filter((i) => i.kind === "reply").map((i) => i.id))];
  const boardSlugs = [...new Set(list.filter((i) => i.kind === "new" || i.kind === "newtitle").map((i) => i.id))];
  const usernames = [...new Set(list.filter((i) => i.kind === "msg").map((i) => i.id))];

  const [threads, boards, users] = await Promise.all([
    threadIds.length
      ? db.thread
          .findMany({
            where: { id: { in: threadIds } },
            select: { id: true, title: true, board: { select: { slug: true, name: true } } },
          })
          .catch(() => [])
      : Promise.resolve([]),
    boardSlugs.length
      ? db.board.findMany({ where: { slug: { in: boardSlugs } }, select: { slug: true, name: true } }).catch(() => [])
      : Promise.resolve([]),
    usernames.length
      ? db.user.findMany({ where: { username: { in: usernames } }, select: { username: true } }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const threadMap = new Map(threads.map((t) => [t.id, t]));
  const boardMap = new Map(boards.map((b) => [b.slug, b]));
  const userSet = new Set(users.map((u) => u.username));

  return list.map(({ kind, id }) => {
    if (kind === "reply") {
      const t = threadMap.get(id);
      return t
        ? { kind, id, title: t.title, subtitle: t.board.name, href: `/t/${t.id}`, missing: false }
        : { kind, id, title: "主题已不存在", subtitle: "回复草稿", href: null, missing: true };
    }
    if (kind === "new" || kind === "newtitle") {
      const b = boardMap.get(id);
      return b
        ? { kind, id, title: `在「${b.name}」发新主题`, subtitle: "新主题草稿", href: `/c/${b.slug}/new`, missing: false }
        : { kind, id, title: "版块已不存在", subtitle: "新主题草稿", href: null, missing: true };
    }
    if (kind === "msg") {
      return userSet.has(id)
        ? { kind, id, title: `发给 ${id}`, subtitle: "私信草稿", href: `/messages/${encodeURIComponent(id)}`, missing: false }
        : { kind, id, title: `发给 ${id}`, subtitle: "用户已不存在", href: null, missing: true };
    }
    return { kind, id, title: "草稿", subtitle: kind, href: null, missing: true };
  });
}
