import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import AuthRequired from "@/components/AuthRequired";

export const dynamic = "force-dynamic";

/**
 * 私信列表(需登录):
 * - 按会话聚合(对方用户为维度)，展示最新一条消息、时间、未读数
 * - 未登录展示登录卡片；无会话时给空状态 + 引导去找人
 */
export default async function MessagesPage() {
  const me = await getCurrentUser();
  if (!me) return <AuthRequired title="请先登录查看私信" description="登录后可与站内用户一对一私信，支持 Markdown。" next="/messages" />;

  // 拉最近 200 条相关私信，内存里按对方聚合（极简版无会话表）
  const recent = await db.directMessage.findMany({
    where: { OR: [{ senderId: me.id }, { receiverId: me.id }] },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      sender: { select: { username: true } },
      receiver: { select: { username: true } },
    },
  });

  // 聚合: counterpart -> { last, unread, total }
  const map = new Map<
    string,
    { username: string; last: (typeof recent)[number]; unread: number; total: number }
  >();

  for (const m of recent) {
    const isMeSender = m.senderId === me.id;
    const otherUsername = isMeSender ? m.receiver.username : m.sender.username;
    const entry = map.get(otherUsername);
    if (!entry) {
      map.set(otherUsername, {
        username: otherUsername,
        last: m,
        unread: !isMeSender && !m.read ? 1 : 0,
        total: 1,
      });
    } else {
      // recent 已按时间倒序，last 保持第一条；只累计未读与总数
      entry.total += 1;
      if (!isMeSender && !m.read) entry.unread += 1;
    }
  }

  // 按最后消息时间倒序
  const conversations = [...map.values()].sort(
    (a, b) => b.last.createdAt.getTime() - a.last.createdAt.getTime(),
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>私信</span>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>私信</h1>
        <p style={{ color: "var(--text-subtle)", fontSize: 12, margin: "6px 0 0" }}>
          与站内用户一对一私信 · 点击进入对话
        </p>
      </div>

      {conversations.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            还没有私信，去用户主页发起对话吧。
          </p>
          <p style={{ marginTop: 10 }}>
            <Link href="/search" style={{ color: "var(--brand)", fontSize: 13 }}>
              搜索用户 →
            </Link>
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {conversations.map((c) => {
              const last = c.last;
              const isMeSender = last.senderId === me.id;
              const preview = last.contentMd.replace(/\s+/g, " ").slice(0, 80);
              return (
                <li
                  key={c.username}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderBottom: "1px solid var(--line-soft)",
                  }}
                >
                  <div
                    className="post-avatar"
                    style={{ width: 36, height: 36, fontSize: 12, flexShrink: 0 }}
                  >
                    {c.username.slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Link
                        href={`/messages/${encodeURIComponent(c.username)}`}
                        style={{ fontWeight: 700, fontSize: 13 }}
                      >
                        {c.username}
                      </Link>
                      {c.unread > 0 && (
                        <span
                          style={{
                            background: "var(--danger)",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: 999,
                            minWidth: 18,
                            textAlign: "center",
                          }}
                        >
                          {c.unread}
                        </span>
                      )}
                      <span style={{ color: "var(--text-subtle)", fontSize: 11, marginLeft: "auto" }}>
                        {formatDate(last.createdAt)}
                      </span>
                    </div>
                    <div
                      style={{
                        color: isMeSender ? "var(--text-subtle)" : "var(--text-muted)",
                        fontSize: 12,
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {isMeSender ? "我: " : ""}
                      {preview || "(空)"}
                    </div>
                  </div>
                  <Link
                    href={`/messages/${encodeURIComponent(c.username)}`}
                    style={{
                      flexShrink: 0,
                      height: 28,
                      padding: "0 12px",
                      display: "inline-flex",
                      alignItems: "center",
                      border: "1px solid var(--line)",
                      borderRadius: 999,
                      background: "var(--panel)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                    }}
                  >
                    进入对话
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
