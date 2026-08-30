import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { renderMarkdown, linkMentions, collectMentionCandidates } from "@/lib/markdown";
import { formatDate } from "@/lib/format";
import AuthRequired from "@/components/AuthRequired";
import EmptyState from "@/components/EmptyState";
import UserAvatar from "@/components/UserAvatar";
import MessageComposer from "@/components/MessageComposer";

export const dynamic = "force-dynamic";

/**
 * 对话页:展示我与 @username 的私信历史，底部可发送。
 * - 输入框 Enter 发送（Shift+Enter 换行），@ 提及复用 MentionAutocomplete 高亮
 * - 消息渲染时 @ 高亮（linkMentions）
 * - 空态用 EmptyState
 * 进入时把对方发给我的未读标为已读。未登录展示登录卡片。
 */
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { username } = await params;
  const { error } = await searchParams;
  const me = await getCurrentUser();
  if (!me)
    return (
      <AuthRequired
        title="请先登录查看私信"
        description="登录后可与站内用户一对一私信，支持 Markdown。"
        next={`/messages/${username}`}
      />
    );

  const other = await db.user.findUnique({
    where: { username },
    select: { id: true, username: true, bio: true, avatarUrl: true },
  });
  if (!other) notFound();
  if (other.id === me.id) redirect("/messages");

  // 进入即标已读
  await db.directMessage
    .updateMany({
      where: { senderId: other.id, receiverId: me.id, read: false },
      data: { read: true },
    })
    .catch(() => {});

  const messages = await db.directMessage.findMany({
    where: {
      OR: [
        { senderId: me.id, receiverId: other.id },
        { senderId: other.id, receiverId: me.id },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // @高亮：收集候选并查真实用户
  const candidates = collectMentionCandidates(messages.map((m) => m.contentMd));
  const mentionUsers = candidates.length
    ? await db.user.findMany({ where: { username: { in: candidates } }, select: { username: true } })
    : [];
  const existingMentions = new Set(mentionUsers.map((u) => u.username));

  const ERRORS: Record<string, string> = {
    invalid: "内容格式不对",
    sensitive: "内容包含敏感词，请修改后重试",
    ratelimited: "发送太频繁，请稍后再试",
    self: "不能给自己发私信",
    user_not_found: "用户不存在",
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <Link href="/messages">私信</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{other.username}</span>
      </div>

      <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <UserAvatar username={other.username} avatarUrl={other.avatarUrl} size={40} radius={10} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{other.username}</div>
          {other.bio ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>{other.bio.slice(0, 80)}</div>
          ) : (
            <Link href={`/u/${encodeURIComponent(other.username)}`} style={{ color: "var(--brand)", fontSize: 12 }}>
              查看主页 →
            </Link>
          )}
        </div>
        <Link
          href="/messages"
          style={{
            marginLeft: "auto",
            height: 28,
            padding: "0 12px",
            display: "inline-flex",
            alignItems: "center",
            border: "1px solid var(--line)",
            borderRadius: 999,
            background: "var(--panel)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          返回列表
        </Link>
      </div>

      {error && ERRORS[error] && (
        <p
          style={{
            background: "var(--danger-soft)",
            color: "var(--danger)",
            border: "1px solid #fecaca",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 13,
          }}
        >
          {ERRORS[error]}
        </p>
      )}

      <div className="card" style={{ padding: 14, display: "grid", gap: 12 }}>
        {messages.length === 0 ? (
          <EmptyState
            variant="default"
            title="还没有消息"
            description={`和 ${other.username} 还没有消息，发一条打个招呼吧。支持 @提及 高亮。`}
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {messages.map((m) => {
              const isMe = m.senderId === me.id;
              const html = linkMentions(renderMarkdown(m.contentMd), existingMentions);
              return (
                <li
                  key={m.id}
                  style={{
                    display: "flex",
                    justifyContent: isMe ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "78%",
                      border: "1px solid var(--line)",
                      borderRadius: 12,
                      padding: "8px 12px",
                      background: isMe ? "var(--brand)" : "var(--panel)",
                      color: isMe ? "#fff" : "var(--text)",
                    }}
                  >
                    <div
                      className="post-content"
                      style={{
                        color: isMe ? "#fff" : "var(--text)",
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                    >
                      <div
                        dangerouslySetInnerHTML={{ __html: html }}
                        style={{ wordBreak: "break-word" }}
                      />
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: isMe ? "rgba(255,255,255,0.7)" : "var(--text-subtle)",
                        textAlign: "right",
                      }}
                    >
                      {formatDate(m.createdAt)}
                      {isMe && !m.read ? " · 未读" : ""}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <MessageComposer receiverUsername={other.username} />
      </div>
    </div>
  );
}
