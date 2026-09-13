/** 版块分组/子树（纯函数，便于单测） */

export interface BoardLike {
  id: string;
  slug: string;
  name: string;
  group?: string | null;
  parentId?: string | null;
  order?: number;
  _count?: { threads: number };
}

export interface BoardGroup {
  group: string;
  boards: BoardLike[];
}

export function groupBoards<T extends BoardLike>(boards: readonly T[]): BoardGroup[] {
  const map = new Map<string, T[]>();
  for (const b of boards) {
    const g = (b.group || "默认分区").trim() || "默认分区";
    const arr = map.get(g) ?? [];
    arr.push(b);
    map.set(g, arr);
  }
  // 默认分区置顶，其余按拼音/首字排序；组内按 order
  const groups = [...map.entries()].map(([group, list]) => ({
    group,
    boards: [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  }));
  groups.sort((a, b) => {
    if (a.group === "默认分区") return -1;
    if (b.group === "默认分区") return 1;
    return a.group.localeCompare(b.group, "zh-CN");
  });
  return groups;
}

export interface BoardNode<T extends BoardLike> extends BoardGroup {
  roots: (T & { children: T[] })[];
}

/** 一层子树：parentId 为空的是根，其 children 为子版块（孤儿挂回根） */
export function buildBoardTree<T extends BoardLike>(boards: readonly T[]): (T & { children: T[] })[] {
  const byId = new Map(boards.map((b) => [b.id, b]));
  const roots: (T & { children: T[] })[] = [];
  const childIds = new Set<string>();
  for (const b of boards) {
    if (b.parentId && byId.has(b.parentId)) childIds.add(b.id);
  }
  for (const b of boards) {
    if (b.parentId && byId.has(b.parentId)) continue;
    const children = boards.filter((c) => c.parentId === b.id);
    roots.push({ ...b, children });
  }
  // 父版块被隐藏/过滤掉的孤儿，直接当根展示，避免消失
  for (const b of boards) {
    if (childIds.has(b.id) && !byId.get(b.parentId!)?.parentId && !roots.some((r) => r.children.some((c) => c.id === b.id))) {
      const parentGone = !boards.some((x) => x.id === b.parentId);
      if (parentGone) roots.push({ ...b, children: [] });
    }
  }
  return roots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
