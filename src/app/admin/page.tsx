import Link from "next/link";
import type { CSSProperties } from "react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { threadHref } from "@/lib/slug";
import EmptyState from "@/components/EmptyState";
import AuthRequired from "@/components/AuthRequired";
import {
  addPointsAction,
  addSensitiveWordAction,
  adminDeletePostAction,
  adminDeleteThreadAction,
  adminToggleLockAction,
  adminTogglePinAction,
  banUserAction,
  createBoardAction,
  deleteBoardAction,
  moveBoardAction,
  removeSensitiveWordAction,
  reviewReportAction,
  setUserRoleAction,
  unbanUserAction,
} from "./actions";
import { listActiveBans } from "@/lib/ban";
import { listSensitiveWords } from "@/lib/sensitive";
import { ConfirmForm, NativeConfirmForm } from "./ConfirmForms";

export const metadata = { title: "管理后台" };

const TABS = [
  { key: "threads", label: "主题管理" },
  { key: "posts", label: "帖子管理" },
  { key: "users", label: "用户管理" },
  { key: "boards", label: "版块管理" },
  { key: "reports", label: "举报队列" },
  { key: "words", label: "敏感词" },
  { key: "audit", label: "审计日志" },
] as const;

const ERRORS: Record<string, string> = {
  invalid: "输入格式不对",
  not_found: "目标不存在或已被删除",
  slug_taken: "版块 slug 已被占用",
  self_role: "不能修改自己的角色",
  self_ban: "不能封禁自己",
  word_exists: "该词已存在",
  already_processed: "该举报已处理过",
};

const ACTION_LABELS: Record<string, string> = {
  toggle_pin: "置顶/取消置顶",
  toggle_lock: "锁定/解锁",
  delete_thread: "删除主题",
  delete_post: "删除帖子",
  set_role: "修改角色",
  add_points: "加积分",
  create_board: "创建版块",
  delete_board: "删除版块",
  move_board: "移动版块",
  review_report: "处理举报",
  ban_user: "封禁用户",
  unban_user: "解封用户",
  add_word: "添加敏感词",
  remove_word: "移除敏感词",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { tab, error } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="breadcrumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>管理后台</span>
        </div>
        <AuthRequired title="请先登录" description="管理后台仅对登录用户开放，登录后若拥有管理员权限即可进入。" next="/admin" />
      </div>
    );
  }
  if (!isAdmin(user)) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="breadcrumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>管理后台</span>
        </div>
        <EmptyState
          variant="report"
          title="无权访问"
          description="当前账号没有管理员权限，请联系现有管理员授予权限。"
          actionLabel="返回首页"
          actionHref="/"
        />
      </div>
    );
  }

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
      {active === "words" && <WordsTab />}
      {active === "audit" && <AuditTab />}
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
          主题管理 <span>最近 {threads.length} 条 · 删除需二次确认</span>
        </div>
      </div>
      <ListCard>
        {threads.map((t) => (
          <Row key={t.id}>
            <Link href={threadHref(t.id, t.title)} style={{ fontWeight: 600, fontSize: 13, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
              <ConfirmForm
                action={adminDeleteThreadAction}
                message={`确认删除主题「${t.title}」？\n该主题下的全部回帖与附件将被级联删除，此操作不可恢复。`}
              >
                <input type="hidden" name="threadId" value={t.id} />
                <button type="submit" style={dangerBtn}>
                  删除主题
                </button>
              </ConfirmForm>
            </span>
          </Row>
        ))}
        {threads.length === 0 && (
          <li style={{ padding: 12 }}>
            <EmptyState variant="thread" title="暂无主题" description="还没有任何主题，等待用户发帖后将在此展示。" />
          </li>
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
          帖子管理 <span>最近 {posts.length} 条 · 删除需二次确认</span>
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {posts.map((p) => (
          <Row key={p.id}>
            <div className="post-avatar" style={{ width: 24, height: 24, fontSize: 10, overflow: "hidden" }}>
              {p.author.username.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Link href={threadHref(p.thread.id, p.thread.title)} style={{ fontSize: 12, color: "var(--brand)" }}>
                {p.thread.title}
              </Link>
              <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>
                {p.contentMd.replace(/\s+/g, " ").slice(0, 80) || "（空内容）"}
              </div>
            </div>
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{p.author.username}</span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{formatDate(p.createdAt)}</span>
            <ConfirmForm
              action={adminDeletePostAction}
              message={`确认删除该帖子？\n作者：${p.author.username}\n所在主题：${p.thread.title.slice(0, 40)}\n附件与相关举报将一并清理，不可恢复。`}
            >
              <input type="hidden" name="postId" value={p.id} />
              <button type="submit" style={dangerBtn}>
                删除帖子
              </button>
            </ConfirmForm>
          </Row>
        ))}
        {posts.length === 0 && (
          <li style={{ padding: 12 }}>
            <EmptyState variant="post" title="暂无帖子" description="还没有任何回帖，等待用户回复后将在此展示。" />
          </li>
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
  const bans = await listActiveBans(users.map((u) => u.id));

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="quick-title" style={{ margin: 0 }}>
          用户管理 <span>{users.length} 人 · 角色变更需二次确认</span>
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {users.map((u) => {
          const ban = bans.get(u.id);
          return (
          <Row key={u.id}>
            <div className="post-avatar" style={{ width: 24, height: 24, fontSize: 10, overflow: "hidden" }}>
              {u.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/avatar?file=${encodeURIComponent(u.avatarUrl)}`} alt={u.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                u.username.slice(0, 1).toUpperCase()
              )}
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
            {ban && (
              <span
                style={{ background: "var(--danger-soft)", color: "var(--danger)", fontSize: 10, padding: "2px 6px", borderRadius: 999, border: "1px solid #fecaca" }}
                title={ban.reason}
              >
                封禁中{ban.expiresAt ? ` · 至 ${formatDate(ban.expiresAt)}` : " · 永久"}
              </span>
            )}
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>
              {u.points} 分 · {u._count.threads} 主题 · {u._count.posts} 回复 · {formatDate(u.createdAt)}
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {ban ? (
                u.id !== currentUserId && (
                  <NativeConfirmForm
                    action={unbanUserAction}
                    message={`确认解封用户「${u.username}」？解封后即可正常登录。`}
                  >
                    <input type="hidden" name="userId" value={u.id} />
                    <button type="submit" style={actionBtn}>解封</button>
                  </NativeConfirmForm>
                )
              ) : (
                u.id !== currentUserId && (
                  <ConfirmForm
                    action={banUserAction}
                    message={`确认封禁用户「${u.username}」？\n封禁期内 TA 将无法登录，永久封禁请留空天数。`}
                    style={{ display: "flex", gap: 6, alignItems: "center" }}
                  >
                    <input type="hidden" name="userId" value={u.id} />
                    <input
                      name="reason"
                      placeholder="原因"
                      maxLength={200}
                      style={{ width: 72, height: 26, border: "1px solid var(--line)", borderRadius: 6, padding: "0 6px", fontSize: 12, outline: "none" }}
                    />
                    <input
                      type="number"
                      name="durationDays"
                      min={1}
                      max={3650}
                      placeholder="天数"
                      title="留空为永久封禁"
                      style={{ width: 56, height: 26, border: "1px solid var(--line)", borderRadius: 6, padding: "0 6px", fontSize: 12, outline: "none" }}
                    />
                    <button type="submit" style={dangerBtn}>封禁</button>
                  </ConfirmForm>
                )
              )}
              {u.id !== currentUserId && (
                <ConfirmForm
                  action={setUserRoleAction}
                  message={
                    u.role === "ADMIN"
                      ? `确认取消用户「${u.username}」的管理员权限？\nTA将失去后台全部管理能力。`
                      : `确认将用户「${u.username}」设为管理员？\nTA将获得后台主题/帖子/版块等全部管理权限，请谨慎操作。`
                  }
                >
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="role" value={u.role === "ADMIN" ? "USER" : "ADMIN"} />
                  <button type="submit" style={actionBtn}>
                    {u.role === "ADMIN" ? "取消管理员" : "设为管理员"}
                  </button>
                </ConfirmForm>
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
          );
        })}
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
            版块列表 <span>{boards.length} 个 · 删除需二次确认</span>
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
                  <button style={{ ...actionBtn, opacity: i === 0 ? 0.4 : 1 }} disabled={i === 0}>
                    上移
                  </button>
                </form>
                <form action={moveBoardAction}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <input type="hidden" name="dir" value="down" />
                  <button style={{ ...actionBtn, opacity: i === boards.length - 1 ? 0.4 : 1 }} disabled={i === boards.length - 1}>
                    下移
                  </button>
                </form>
                <ConfirmForm
                  action={deleteBoardAction}
                  message={`确认删除版块「${b.name}（/${b.slug}）」？\n该版块下 ${b._count.threads} 个主题及其全部回帖、附件将级联删除，且相关举报将静默结案。此操作不可恢复！`}
                >
                  <input type="hidden" name="boardId" value={b.id} />
                  <button type="submit" style={dangerBtn}>
                    删除版块
                  </button>
                </ConfirmForm>
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
                  href={threadHref(isThread ? r.targetId : postMap.get(r.targetId) ?? "", targetTitle ?? "")}
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
                <ConfirmForm
                  action={reviewReportAction}
                  message={`确认删除被举报的${isThread ? "主题" : "帖子"}并结案该举报？`}
                >
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="action" value={isThread ? "delete_thread" : "delete_post"} />
                  <button type="submit" style={dangerBtn}>
                    删除目标
                  </button>
                </ConfirmForm>
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
          <li style={{ padding: 12 }}>
            <EmptyState variant="report" />
          </li>
        )}
      </ul>
    </div>
  );
}

/* ---------------- 审计日志 ---------------- */

async function AuditTab() {
  const logs = await db.auditLog
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { username: true } } },
    })
    .catch(() => []);
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="quick-title" style={{ margin: 0 }}>
          审计日志 <span>最近 {logs.length} 条 · 仅展示最近 50 条</span>
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {logs.map((l) => (
          <Row key={l.id}>
            <span
              className="topic-badge"
              style={{
                background: l.action.startsWith("delete") ? "var(--danger-soft)" : "var(--brand-soft)",
                color: l.action.startsWith("delete") ? "var(--danger)" : "var(--brand)",
                border: l.action.startsWith("delete") ? "1px solid #fecaca" : "1px solid var(--line)",
              }}
            >
              {ACTION_LABELS[l.action] ?? l.action}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{l.actor.username}</span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>
              {l.targetType}
              {l.targetId ? ` · ${l.targetId.slice(-6)}` : ""}
              {l.detail ? ` · ${l.detail.slice(0, 40)}` : ""}
            </span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12, marginLeft: "auto" }}>{formatDate(l.createdAt)}</span>
          </Row>
        ))}
        {logs.length === 0 && (
          <li style={{ padding: 12 }}>
            <EmptyState variant="report" title="暂无审计记录" description="管理操作将自动留痕，最近 50 条在此展示。" />
          </li>
        )}
      </ul>
    </div>
  );
}

/* ---------------- 敏感词 ---------------- */

async function WordsTab() {
  const words = await listSensitiveWords();
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="quick-title" style={{ margin: 0 }}>
          敏感词 <span>{words.length} 条 · 发帖/回帖/私信命中即拦截 · 增删后 1 分钟内生效（内存缓存）</span>
        </div>
      </div>
      <form
        action={addSensitiveWordAction}
        style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", alignItems: "center", flexWrap: "wrap" }}
      >
        <input
          name="word"
          required
          maxLength={30}
          placeholder="输入要拦截的词（≤30 字，自动转小写去重）"
          style={{ flex: 1, minWidth: 180, height: 26, border: "1px solid var(--line)", borderRadius: 6, padding: "0 8px", fontSize: 12, outline: "none" }}
        />
        <button type="submit" style={actionBtn}>添加</button>
      </form>
      <ListCard>
        {words.map((w) => (
          <Row key={w.id}>
            <span className="topic-badge" style={{ background: "var(--brand-soft)", color: "var(--brand)", border: "1px solid var(--line)" }}>
              {w.word}
            </span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>{formatDate(w.createdAt)}</span>
            <span style={{ marginLeft: "auto" }}>
              <NativeConfirmForm action={removeSensitiveWordAction} message={`确认移除敏感词「${w.word}」？`}>
                <input type="hidden" name="id" value={w.id} />
                <button type="submit" style={dangerBtn}>移除</button>
              </NativeConfirmForm>
            </span>
          </Row>
        ))}
        {words.length === 0 && (
          <li style={{ padding: 12 }}>
            <EmptyState variant="report" title="暂无自定义敏感词" description="此时自动回退内置默认词表；添加词条后立即生效。" />
          </li>
        )}
      </ListCard>
    </div>
  );
}
