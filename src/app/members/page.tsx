import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getOnlineIds } from "@/lib/online";
import { levelForPoints } from "@/lib/levels";
import EmptyState from "@/components/EmptyState";
import LevelBadge from "@/components/LevelBadge";
import UserAvatar from "@/components/UserAvatar";

export const metadata: Metadata = {
  title: "会员目录",
  description: "浏览 SHUAI GAY 社区成员：按最近活跃、加入时间、积分或主题数排序，查看谁在线。",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;
const MAX_Q = 30;

type SortKey = "active" | "new" | "points" | "threads";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "active", label: "最近活跃" },
  { key: "new", label: "最新加入" },
  { key: "points", label: "积分榜" },
  { key: "threads", label: "主题数" },
];

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string; online?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, MAX_Q);
  const sort: SortKey = (SORTS.some((s) => s.key === sp.sort) ? sp.sort : "active") as SortKey;
  const page = Math.max(1, Number(sp.page) || 1);
  const onlineOnly = sp.online === "1";

  const onlineIds = await getOnlineIds();
  const onlineFilter = onlineOnly && onlineIds ? [...onlineIds] : null;

  const where = {
    ...(q ? { username: { contains: q, mode: "insensitive" as const } } : {}),
    ...(onlineFilter ? { id: { in: onlineFilter } } : {}),
  };

  const orderBy =
    sort === "new"
      ? [{ createdAt: "desc" as const }]
      : sort === "points"
        ? [{ points: "desc" as const }, { createdAt: "asc" as const }]
        : sort === "threads"
          ? [{ threads: { _count: "desc" as const } }, { createdAt: "asc" as const }]
          : [{ lastActiveAt: "desc" as const }, { createdAt: "desc" as const }];

  const [total, rows] = await Promise.all([
    db.user.count({ where }).catch(() => 0),
    db.user
      .findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          bio: true,
          points: true,
          role: true,
          createdAt: true,
          lastActiveAt: true,
          _count: { select: { threads: true, posts: true, followers: true } },
        },
      })
      .catch(() => [] as never[]),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const onlineCount = onlineIds
    ? await db.user.count({ where: { id: { in: [...onlineIds] } } }).catch(() => 0)
    : null;

  const buildHref = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort !== "active") params.set("sort", sort);
    if (onlineOnly) params.set("online", "1");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/members?${qs}` : "/members";
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>会员目录</span>
      </div>

      <div className="card" style={{ padding: 14, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 className="page-heading">会员目录</h1>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--text-subtle)" }}>
              共 {total} 位成员{onlineCount !== null ? ` · 当前在线 ${onlineCount}` : ""} · 遇到同频的就关注一下
            </p>
          </div>
          {onlineIds && (
            <Link
              href={buildHref({ online: onlineOnly ? null : "1", page: null })}
              className={`tab ${onlineOnly ? "active" : ""}`}
              style={{ flexShrink: 0 }}
            >
              {onlineOnly ? "✓ 只看在线" : "只看在线"}
            </Link>
          )}
        </div>

        <form action="/members" method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {sort !== "active" && <input type="hidden" name="sort" value={sort} />}
          {onlineOnly && <input type="hidden" name="online" value="1" />}
          <label style={{ flex: 1, minWidth: 200, display: "flex" }}>
            <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>搜索用户名</span>
            <input
              name="q"
              defaultValue={q}
              maxLength={MAX_Q}
              placeholder="搜索用户名"
              style={{ flex: 1, height: 38, border: "1px solid var(--line)", borderRadius: 10, padding: "0 12px", fontSize: 13, background: "var(--panel)", outline: "none" }}
            />
          </label>
          <button type="submit" className="btn-publish" style={{ minHeight: 38, height: 38 }}>
            搜索
          </button>
          {q && (
            <Link href={buildHref({ q: null, page: null })} className="tab" style={{ height: 38, minHeight: 38 }}>
              清除
            </Link>
          )}
        </form>

        <nav className="tab-bar" aria-label="排序">
          {SORTS.map((s) => (
            <Link key={s.key} href={buildHref({ sort: s.key === "active" ? null : s.key, page: null })} className={`tab ${sort === s.key ? "active" : ""}`}>
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          variant="default"
          title={q ? `没有找到「${q}」` : onlineOnly ? "现在没有人在线" : "还没有成员"}
          description={q ? "换个关键词试试，用户名支持部分匹配。" : onlineOnly ? "过一会儿再来看看，或者取消「只看在线」。" : "等第一位成员加入吧。"}
          actionLabel={q || onlineOnly ? "查看全部成员" : "返回首页"}
          actionHref={q || onlineOnly ? "/members" : "/"}
        />
      ) : (
        <ul className="member-grid">
          {rows.map((u) => {
            const isOnline = !!onlineIds?.has(u.id);
            const lv = levelForPoints(u.points);
            return (
              <li key={u.id} className="member-card">
                <Link href={`/u/${encodeURIComponent(u.username)}`} className="member-avatar" aria-label={`${u.username} 主页`}>
                  <UserAvatar username={u.username} avatarUrl={u.avatarUrl} size={52} radius={14} />
                  {isOnline && <span className="member-online-dot" title="在线" aria-label="在线" />}
                </Link>
                <div style={{ display: "grid", gap: 4, minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Link href={`/u/${encodeURIComponent(u.username)}`} style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {u.username}
                    </Link>
                    <LevelBadge points={u.points} role={u.role} />
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-subtle)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>{lv.name}</span>
                    <span>{u.points} 分</span>
                    <span>{u._count.threads} 主题</span>
                    <span>{u._count.followers} 粉丝</span>
                  </div>
                  <p className="member-bio">{u.bio?.trim() || "这个人很懒，什么都没写"}</p>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>
                    {isOnline ? <span style={{ color: "var(--success)", fontWeight: 700 }}>● 在线 · </span> : null}
                    {u.lastActiveAt ? `最近活跃 ${formatDate(u.lastActiveAt)}` : `加入于 ${formatDate(u.createdAt)}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="tab-bar" aria-label="分页" style={{ justifyContent: "center" }}>
          {page > 1 && (
            <Link className="tab" href={buildHref({ page: String(page - 1) })}>
              上一页
            </Link>
          )}
          <span style={{ fontSize: 12, color: "var(--text-subtle)", padding: "0 8px" }}>
            第 {page} / {totalPages} 页
          </span>
          {page < totalPages && (
            <Link className="tab" href={buildHref({ page: String(page + 1) })}>
              下一页
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
