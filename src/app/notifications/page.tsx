import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import AuthRequired from "@/components/AuthRequired";
import EmptyState from "@/components/EmptyState";
import { formatDate } from "@/lib/format";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";

export const metadata: Metadata = { title: "通知" };

const PAGE_SIZE = 20;

const TYPE_LABEL: Record<string, string> = {
  reply: "回复",
  mention: "提及",
  rate: "点赞",
  favorite: "收藏",
  report: "举报",
  system: "系统",
};

const TYPE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  reply: { bg: "#EDE9FE", color: "#7C3AED", border: "#DDD6FE" },
  mention: { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
  rate: { bg: "#FDF2F8", color: "#DB2777", border: "#FBCFE8" },
  favorite: { bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  report: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
  system: { bg: "#F4F4F5", color: "#52525B", border: "#E4E4E7" },
};

function typeBadge(type: string) {
  const s = TYPE_STYLE[type] ?? TYPE_STYLE.system!;
  return (
    <span
      className="topic-badge"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, flexShrink: 0 }}
    >
      {TYPE_LABEL[type] ?? "通知"}
    </span>
  );
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="breadcrumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>通知</span>
        </div>
        <AuthRequired
          title="登录后查看通知"
          description="有人回复你、@你、给你点赞时，通知会聚合在这里，登录后即可查看。"
          next="/notifications"
        />
      </div>
    );
  }

  const sp = await searchParams;
  const onlyUnread = sp.filter === "unread";
  const page = Math.max(1, Number(sp.page) || 1);

  const where = onlyUnread ? { userId: user.id, read: false } : { userId: user.id };
  const [items, total, unread] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.notification.count({ where }).catch(() => 0),
    db.notification.count({ where: { userId: user.id, read: false } }).catch(() => 0),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const list =
    safePage === page
      ? items
      : await db.notification
          .findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (safePage - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
          })
          .catch(() => []);
  const qs = onlyUnread ? "&filter=unread" : "";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>通知</span>
        {unread > 0 && (
          <span
            style={{
              background: "var(--danger)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              padding: "1px 7px",
              borderRadius: 999,
            }}
          >
            {unread} 未读
          </span>
        )}
      </div>

      <div className="topic-toolbar">
        <div className="tab-bar">
          <Link href="/notifications" className={`tab ${!onlyUnread ? "active" : ""}`}>
            全部
          </Link>
          <Link
            href="/notifications?filter=unread"
            className={`tab ${onlyUnread ? "active" : ""}`}
          >
            未读{unread > 0 ? ` ${unread}` : ""}
          </Link>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="tab">
              全部标为已读
            </button>
          </form>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          variant="post"
          title={onlyUnread ? "没有未读通知" : "还没有通知"}
          description={
            onlyUnread
              ? "全部已读，做得好——有人回复或 @ 你时这里会有提醒。"
              : "有人回复你的主题、@ 你、给你点赞或收藏更新时，通知会聚合在这里。"
          }
          actionLabel="去逛逛"
          actionHref="/"
        />
      ) : (
        <ul className="post-list">
          {list.map((n) => (
            <li
              key={n.id}
              className="post-item"
              style={{
                alignItems: "flex-start",
                background: n.read ? undefined : "#FFFBEA",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  marginTop: 6,
                  flexShrink: 0,
                  background: n.read ? "var(--line-faint)" : "var(--danger)",
                  boxShadow: n.read ? "none" : "0 0 0 3px var(--danger-soft)",
                }}
              />
              <div className="post-body">
                <div className="post-title-row">
                  {typeBadge(n.type)}
                  {n.link ? (
                    <Link href={n.link} prefetch={false} className="post-title" title={n.title}>
                      {n.title}
                    </Link>
                  ) : (
                    <span className="post-title" style={{ cursor: "default" }}>
                      {n.title}
                    </span>
                  )}
                </div>
                {n.body && (
                  <div
                    className="post-excerpt"
                    style={{ marginTop: 3, WebkitLineClamp: 2 }}
                  >
                    {n.body}
                  </div>
                )}
                <div className="post-meta">
                  <span>{formatDate(n.createdAt)}</span>
                  {!n.read && (
                    <form action={markNotificationReadAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={n.id} />
                      <button
                        type="submit"
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--violet)",
                          padding: "2px 4px",
                        }}
                      >
                        标为已读
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          {safePage > 1 ? (
            <Link
              href={`/notifications?page=${safePage - 1}${qs}`}
              className="tab"
              style={{ height: 36, padding: "0 18px" }}
            >
              ← 上一页
            </Link>
          ) : (
            <span />
          )}
          <span
            style={{
              fontSize: 12,
              color: "var(--text-subtle)",
              fontVariantNumeric: "tabular-nums",
              alignSelf: "center",
            }}
          >
            {safePage} / {totalPages}
          </span>
          {safePage < totalPages ? (
            <Link
              href={`/notifications?page=${safePage + 1}${qs}`}
              className="tab"
              style={{ height: 36, padding: "0 18px" }}
            >
              下一页 →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
