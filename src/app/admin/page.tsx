import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import {
  addPointsAction,
  adminDeletePostAction,
  adminDeleteThreadAction,
  adminToggleLockAction,
  adminTogglePinAction,
  createBoardAction,
  deleteBoardAction,
  moveBoardAction,
  reviewReportAction,
  setUserRoleAction,
} from "./actions";

export const metadata = { title: "管理后台" };

const TABS = [
  { key: "threads", label: "主题管理" },
  { key: "posts", label: "帖子管理" },
  { key: "users", label: "用户管理" },
  { key: "boards", label: "版块管理" },
  { key: "reports", label: "举报队列" },
] as const;

const ERRORS: Record<string, string> = {
  invalid: "输入格式不对",
  not_found: "目标不存在或已被删除",
  slug_taken: "版块 slug 已被占用",
  self_role: "不能修改自己的角色",
  already_processed: "该举报已处理过",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { tab, error } = await searchParams;
  const user = await getCurrentUser();
  // 管理后台仅 ADMIN 可见
  if (!user || !isAdmin(user)) redirect("/login");

  const active = TABS.some((t) => t.key === tab) ? (tab as string) : "threads";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>管理后台</span>
      </div>

      <div className="topic-toolbar">
        <div className="tab-bar">
          {TABS.map((t) => (
            <Link key={t.key} href={`/admin?tab=${t.key}`} className={`tab ${active === t.key ? "active" : ""}`}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {error && ERRORS[error] && (
        <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          {ERRORS[error]}
        </p>
      )}

      {active === "threads" && <ThreadsTab />}
      {active === "posts" && <PostsTab />}
      {active === "users" && <UsersTab currentUserId={user.id} />}
      {active === "boards" && <BoardsTab />}
      {active === "reports" && <ReportsTab />}
    </div>
  );
}

/* ---------------- 通用小组件 ---------------- */

const actionBtn: CSSProperties = {
  height: 26,
  padding: "0 10px",
  border: "1px solid var(--line)",
  borderRadius: 6,
  background: "var(--panel)",
  fontSize: 12,
  cursor: "pointer",
};
const dangerBtn: CSSProperties = { ...actionBtn, color: "var(--danger)", borderColor: "#fecaca" };

function ListCard({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {children}
    </ul>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <li
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--bg)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      {children}
    </li>
  );
}

/* ---------------- 主题管理 ---------------- */

async function ThreadsTab() {
  const threads = await db.thread.findMany({
    orderBy: { lastPostAt: "desc" },
    take: 100,
    include: {
      author: { select: { username: true } },
      board: { select: { name: true, slug: true } },
      _count: { select: { posts: true } },
    },
  });

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="quick-title" style={{ margin: 0 }}>
          主题管理 <span>最近 {threads.length} 条</span>
        </div>
      </div>
      <ListCard>
        {threads.map((t) => (
          <Row key={t.id}>
            <Link href={`/t/${t.id}`} style={{ fontWeight: 600, fontSize: 13, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.title}
            </Link>
            {t.pinned && <span className="topic-badge pinned">置顶</span>}
            {t.locked && <span className="topic-badge" style={{ background: "var(--line-soft)" }}>已锁</span>}
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{t.board.name}</span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{t.author.username} · {t._count.posts} 帖</span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{formatDate(t.lastPostAt)}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <form action={adminTogglePinAction}>
                <input type="hidden" name="threadId" value={t.id} />
                <button style={actionBtn}>{t.pinned ? "取消置顶" : "置顶"}</button>
              </form>
              <form action={adminToggleLockAction}>
                <input type="hidden" name="threadId" value={t.id} />
                <button style={actionBtn}>{t.locked ? "解锁" : "锁定"}</button>
              </form>
              <form action={adminDeleteThreadAction}>
                <input type="hidden" name="threadId" value={t.id} />
                <button style={dangerBtn}>删除</button>
              </form>
            </span>
          </Row>
        ))}
        {threads.length === 0 && (
          <li style={{ padding: "14px", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>暂无主题</li>
        )}
      </ListCard>
    </div>
  );
}

/* ---------------- 帖子管理 ---------------- */

async function PostsTab() {
  const posts = await db.post.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      author: { select: { username: true } },
      thread: { select: { id: true, title: true } },
    },
  });

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="quick-title" style={{ margin: 0 }}>
          帖子管理 <span>最近 {posts.length} 条</span>
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {posts.map((p) => (
          <Row key={p.id}>
            <div className="post-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
              {p.author.username.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Link href={`/t/${p.thread.id}`} style={{ fontSize: 12, color: "var(--brand)" }}>
                {p.thread.title}
              </Link>
              <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>
                {p.contentMd.replace(/\s+/g, " ").slice(0, 80) || "（空内容）"}
              </div>
            </div>
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{p.author.username}</span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{formatDate(p.createdAt)}</span>
            <form action={adminDeletePostAction}>
              <input type="hidden" name="postId" value={p.id} />
              <button style={dangerBtn}>删除</button>
            </form>
          </Row>
        ))}
        {posts.length === 0 && (
          <li style={{ padding: "14px", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>暂无帖子</li>
        )}
      </ul>
    </div>
  );
}

/* ---------------- 用户管理 ---------------- */

async function UsersTab({ currentUserId }: { currentUserId: string }) {
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { _count: { select: { posts: true, threads: true } } },
  });

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="quick-title" style={{ margin: 0 }}>
          用户管理 <span>{users.length} 人</span>
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {users.map((u) => (
          <Row key={u.id}>
            <div className="post-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
              {u.username.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                {u.username}
                {u.id === currentUserId && <span style={{ color: "var(--text-subtle)", fontWeight: 400, fontSize: 11 }}>（自己）</span>}
              </span>
              <div style={{ color: "var(--text-subtle)", fontSize: 11 }}>{u.email}</div>
            </div>
            {u.role === "ADMIN" ? (
              <span style={{ background: "var(--inverse)", color: "var(--inverse-text)", fontSize: 10, padding: "2px 6px", borderRadius: 999 }}>管理员</span>
            ) : (
              <span style={{ color: "var(--text-subtle)", fontSize: 11 }}>注册会员</span>
            )}
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>
              {u.points} 分 · {u._count.threads} 主题 · {u._count.posts} 回复 · {formatDate(u.createdAt)}
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {u.id !== currentUserId && (
                <form action={setUserRoleAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="role" value={u.role === "ADMIN" ? "USER" : "ADMIN"} />
                  <button style={actionBtn}>{u.role === "ADMIN" ? "取消管理员" : "设为管理员"}</button>
                </form>
              )}
              <form action={addPointsAction} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="hidden" name="userId" value={u.id} />
                <input
                  type="number"
                  name="points"
                  defaultValue={10}
                  min={-1000}
                  max={1000}
                  style={{ width: 64, height: 26, border: "1px solid var(--line)", borderRadius: 6, padding: "0 8px", fontSize: 12, outline: "none" }}
                />
                <button style={actionBtn}>加分</button>
              </form>
            </span>
          </Row>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- 版块管理 ---------------- */

async function BoardsTab() {
  const boards = await db.board.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { threads: true } } },
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ padding: 14 }}>
        <div className="quick-title" style={{ margin: "0 0 10px" }}>新建版块</div>
        <form action={createBoardAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            name="slug"
            required
            placeholder="slug（如 general）"
            pattern="[a-z0-9-]{1,32}"
            style={{ height: 30, flex: 1, minWidth: 120, border: "1px solid var(--line)", borderRadius: 6, padding: "0 10px", fontSize: 12, outline: "none" }}
          />
          <input
            name="name"
            required
            placeholder="名称"
            maxLength={30}
            style={{ height: 30, flex: 1, minWidth: 120, border: "1px solid var(--line)", borderRadius: 6, padding: "0 10px", fontSize: 12, outline: "none" }}
          />
          <input
            name="description"
            placeholder="简介（可选）"
            maxLength={200}
            style={{ height: 30, flex: 2, minWidth: 160, border: "1px solid var(--line)", borderRadius: 6, padding: "0 10px", fontSize: 12, outline: "none" }}
          />
          <input
            type="number"
            name="order"
            defaultValue={0}
            min={0}
            max={10000}
            title="排序值，越小越靠前"
            style={{ width: 70, height: 30, border: "1px solid var(--line)", borderRadius: 6, padding: "0 8px", fontSize: 12, outline: "none" }}
          />
          <button
            type="submit"
            style={{ height: 30, padding: "0 14px", background: "var(--brand)", color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid var(--brand)", cursor: "pointer" }}
          >
            创建
          </button>
        </form>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)" }}>
          <div className="quick-title" style={{ margin: 0 }}>
            版块列表 <span>{boards.length} 个</span>
          </div>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {boards.map((b, i) => (
            <Row key={b.id}>
              <span style={{ fontSize: 12, color: "var(--text-subtle)", width: 40 }}>#{b.order}</span>
              <div style={{ minWidth: 0 }}>
                <Link href={`/c/${b.slug}`} style={{ fontWeight: 600, fontSize: 13 }}>
                  {b.name}
                </Link>
                <div style={{ color: "var(--text-subtle)", fontSize: 11 }}>
                  /{b.slug}{b.description ? ` · ${b.description}` : ""}
                </div>
              </div>
              <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{b._count.threads} 主题</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <form action={moveBoardAction}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <input type="hidden" name="dir" value="up" />
                  <button style={{ ...actionBtn, opacity: i === 0 ? 0.4 : 1 }} disabled={i === 0}>上移</button>
                </form>
                <form action={moveBoardAction}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <input type="hidden" name="dir" value="down" />
                  <button style={{ ...actionBtn, opacity: i === boards.length - 1 ? 0.4 : 1 }} disabled={i === boards.length - 1}>下移</button>
                </form>
                <form action={deleteBoardAction}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <button style={dangerBtn}>删除</button>
                </form>
              </span>
            </Row>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------------- 举报队列 ---------------- */

async function ReportsTab() {
  const reports = await db.report.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { reporter: { select: { username: true } } },
  });

  const threadIds = reports.filter((r) => r.targetType === "thread").map((r) => r.targetId);
  const postIds = reports.filter((r) => r.targetType === "post").map((r) => r.targetId);
  const [threads, posts] = await Promise.all([
    db.thread.findMany({ where: { id: { in: threadIds } }, select: { id: true, title: true } }),
    db.post.findMany({ where: { id: { in: postIds } }, select: { id: true, threadId: true } }),
  ]);
  const threadMap = new Map(threads.map((t) => [t.id, t.title]));
  const postMap = new Map(posts.map((p) => [p.id, p.threadId]));
  const parentThreads = await db.thread.findMany({
    where: { id: { in: [...new Set(posts.map((p) => p.threadId))] } },
    select: { id: true, title: true },
  });
  const threadTitleMap = new Map(parentThreads.map((t) => [t.id, t.title]));

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="quick-title" style={{ margin: 0 }}>
          举报队列 <span>待处理 {reports.length} 条</span>
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {reports.map((r) => {
          const isThread = r.targetType === "thread";
          const targetTitle = isThread ? threadMap.get(r.targetId) : threadTitleMap.get(postMap.get(r.targetId) ?? "");
          return (
            <Row key={r.id}>
              <span className="topic-badge" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid #fde68a" }}>
                {isThread ? "主题" : "帖子"}
              </span>
              <div style={{ minWidth: 0, maxWidth: 360 }}>
                <Link
                  href={`/t/${isThread ? r.targetId : postMap.get(r.targetId) ?? ""}`}
                  style={{ fontSize: 13, fontWeight: 600, color: targetTitle ? "var(--text)" : "var(--text-subtle)" }}
                >
                  {targetTitle ?? "（内容已不存在）"}
                </Link>
                <div style={{ color: "var(--text-muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.reason}
                </div>
              </div>
              <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>举报：{r.reporter.username}</span>
              <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{formatDate(r.createdAt)}</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <form action={reviewReportAction}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="action" value={isThread ? "delete_thread" : "delete_post"} />
                  <button style={dangerBtn}>删除目标</button>
                </form>
                <form action={reviewReportAction}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="action" value="ignore" />
                  <button style={actionBtn}>忽略</button>
                </form>
                <form action={reviewReportAction}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="action" value="reject" />
                  <button style={actionBtn}>驳回</button>
                </form>
              </span>
            </Row>
          );
        })}
        {reports.length === 0 && (
          <li style={{ padding: "20px 14px", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
            队列已清空，没有待处理的举报
          </li>
        )}
      </ul>
    </div>
  );
}