import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { listPosts } from "@/lib/queries";
import { decodeCursor } from "@/lib/cursor";
import { renderMarkdown } from "@/lib/markdown";
import { canDeletePost, canReply, isAdmin } from "@/lib/permissions";
import { deletePostAction, replyAction, toggleLockAction, togglePinAction } from "@/app/actions/threads";
import { formatDate, formatBytes } from "@/lib/format";
import { MAX_FILES_PER_POST } from "@/lib/storage";

const ERRORS: Record<string, string> = {
  invalid: "内容格式不对",
  forbidden: "没有权限做这个操作",
  locked: "主题已锁定",
  ratelimited: "操作太频繁,请稍后再试",
  file_too_large: "有附件超过大小限制",
  unsupported_type: "不支持的附件类型",
  too_many_files: `最多 ${MAX_FILES_PER_POST} 个附件`,
};

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string; error?: string }>;
}) {
  const { id } = await params;
  const { cursor: rawCursor, error } = await searchParams;

  const thread = await db.thread.findUnique({
    where: { id },
    include: { board: { select: { slug: true, name: true } } },
  });
  if (!thread) notFound();

  const user = await getCurrentUser();
  const admin = isAdmin(user);
  const { items, nextCursor } = await listPosts(thread.id, decodeCursor(rawCursor));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <Link href={`/c/${thread.board.slug}`}>{thread.board.name}</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>主题</span>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, lineHeight: 1.4 }}>{thread.title}</h1>
          {thread.pinned && <span className="topic-badge pinned">置顶</span>}
          {thread.locked && <span className="topic-badge" style={{ background: "var(--line-soft)" }}>已锁</span>}
        </div>
        <div style={{ color: "var(--text-subtle)", fontSize: 12 }}>
          <Link href={`/c/${thread.board.slug}`} style={{ color: "var(--brand)" }}>
            {thread.board.name}
          </Link>{" "}
          · 主题 {thread.id.slice(-6)}
        </div>
        {admin && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <form action={togglePinAction}>
              <input type="hidden" name="threadId" value={thread.id} />
              <button
                style={{
                  height: 28,
                  padding: "0 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  background: "var(--panel)",
                  fontSize: 12,
                }}
              >
                {thread.pinned ? "取消置顶" : "置顶"}
              </button>
            </form>
            <form action={toggleLockAction}>
              <input type="hidden" name="threadId" value={thread.id} />
              <button
                style={{
                  height: 28,
                  padding: "0 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  background: "var(--panel)",
                  fontSize: 12,
                }}
              >
                {thread.locked ? "解锁" : "锁定"}
              </button>
            </form>
          </div>
        )}
      </div>

      {error && ERRORS[error] && (
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          {ERRORS[error]}
        </p>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((p, idx) => {
            const isFirstPost = idx === 0 && !rawCursor;
            const deletable = canDeletePost(user, p, {
              isFirstPost,
              threadLocked: thread.locked,
            });
            return (
              <li
                key={p.id}
                style={{
                  padding: 14,
                  borderBottom: idx === items.length - 1 ? "none" : "1px solid var(--bg)",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <div className="post-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                    {p.authorName.slice(0, 1).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 700 }}>{p.authorName}</span>
                  {p.authorRole === "ADMIN" && (
                    <span style={{ background: "var(--inverse)", color: "var(--inverse-text)", fontSize: 10, padding: "2px 6px", borderRadius: 999 }}>管理员</span>
                  )}
                  <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{formatDate(p.createdAt)}</span>
                  <span style={{ color: "var(--text-subtle)", fontSize: 11, marginLeft: 4 }}>#{idx + 1}</span>
                  {deletable && (
                    <form action={deletePostAction} style={{ marginLeft: "auto" }}>
                      <input type="hidden" name="postId" value={p.id} />
                      <button style={{ color: "var(--text-subtle)", fontSize: 12 }} className="hover:text-red-600">
                        删除
                      </button>
                    </form>
                  )}
                </div>
                <div className="post-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.contentMd) }} />
                {p.attachments.length > 0 && (
                  <ul style={{ display: "flex", flexWrap: "wrap", gap: 8, borderTop: "1px solid var(--line-soft)", paddingTop: 8, fontSize: 12 }}>
                    {p.attachments.map((a) => (
                      <li key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg)", padding: "4px 8px", borderRadius: 6 }}>
                        <a href={`/uploads/${a.storedName}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-hover)" }}>
                          📎 {a.fileName}
                        </a>
                        <span style={{ color: "var(--text-subtle)" }}>({formatBytes(a.sizeBytes)})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {nextCursor && (
        <div style={{ textAlign: "center" }}>
          <Link
            href={`/t/${thread.id}?cursor=${nextCursor}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 32,
              padding: "0 16px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--panel)",
              fontSize: 13,
            }}
          >
            加载后面的回复 →
          </Link>
        </div>
      )}

      <div className="card" style={{ padding: 14 }}>
        {canReply(user, thread) ? (
          <form action={replyAction} style={{ display: "grid", gap: 10 }}>
            <input type="hidden" name="threadId" value={thread.id} />
            <textarea
              name="content"
              required
              rows={5}
              placeholder="回复，支持 Markdown"
              style={{
                width: "100%",
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "10px 12px",
                fontSize: 13,
                outline: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <input
                type="file"
                name="files"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/zip,text/plain"
                style={{ fontSize: 12 }}
              />
              <button
                type="submit"
                style={{ background: "var(--brand)", color: "#fff", borderRadius: 6, height: 32, padding: "0 16px", fontSize: 13, fontWeight: 600, border: "1px solid var(--brand)" }}
              >
                回复
              </button>
            </div>
          </form>
        ) : user ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>主题已锁定，无法回复。</p>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            <Link href={`/login?next=${encodeURIComponent(`/t/${thread.id}`)}`} style={{ color: "var(--brand)" }}>
              登录
            </Link>{" "}
            后回复
          </p>
        )}
      </div>
    </div>
  );
}
