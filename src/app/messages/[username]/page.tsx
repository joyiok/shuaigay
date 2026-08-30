import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/format";
import { sendMessageAction } from "@/app/actions/messages";
import AuthRequired from "@/components/AuthRequired";

export const dynamic = "force-dynamic";

/**
 * 对话页:展示我与 @username 的私信历史，底部可发送。
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
    select: { id: true, username: true, bio: true },
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
        <div className="post-avatar" style={{ width: 38, height: 38, fontSize: 13 }}>
          {other.username.slice(0, 1).toUpperCase()}
        </div>
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
          <p style={{ color: "var(--text-subtle)", fontSize: 13, textAlign: "center", margin: "12px 0" }}>
            还没有消息，发一条打个招呼吧。
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {messages.map((m) => {
              const isMe = m.senderId === me.id;
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
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(m.contentMd) }}
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

        <form action={sendMessageAction} style={{ display: "grid", gap: 8, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
          <input type="hidden" name="receiverUsername" value={other.username} />
          <textarea
            name="content"
            required
            rows={3}
            placeholder={`给 ${other.username} 发私信… 支持 Markdown`}
            style={{
              width: "100%",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 13,
              outline: "none",
              lineHeight: 1.6,
              resize: "vertical",
              minHeight: 72,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              style={{
                height: 32,
                padding: "0 16px",
                background: "var(--brand)",
                color: "#fff",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                border: "1px solid var(--brand)",
              }}
            >
              发送
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
