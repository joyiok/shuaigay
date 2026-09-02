import Link from "next/link";
import type { CSSProperties } from "react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { catToneClass, formatDate } from "@/lib/format";
import { threadHref } from "@/lib/slug";
import EmptyState from "@/components/EmptyState";
import AuthRequired from "@/components/AuthRequired";
import {
  addModeratorAction,
  addPointsAction,
  addSensitiveWordAction,
  adminDeletePostAction,
  adminDeleteThreadAction,
  adminToggleLockAction,
  adminTogglePinAction,
  banUserAction,
  createBoardAction,
  createCategoryAction,
  deleteBoardAction,
  deleteCategoryAction,
  moveBoardAction,
  removeModeratorAction,
  removeSensitiveWordAction,
  reviewReportAction,
  setUserRoleAction,
  unbanUserAction,
} from "./actions";
import { listActiveBans } from "@/lib/ban";
import { listSensitiveWords } from "@/lib/sensitive";
import { ConfirmForm, NativeConfirmForm } from "./ConfirmForms";
import { getModeratedBoardIds } from "@/lib/moderators";
import LevelBadge from "@/components/LevelBadge";
import UserAvatar from "@/components/UserAvatar";

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
  dup_moderator: "该用户已是此版块版主",
  user_not_found: "用户不存在",
  cat_exists: "同名分类已存在",
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
  set_moderator: "任命版主",
  remove_moderator: "撤免版主",
  create_category: "新建分类",
  delete_category: "删除分类",
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
        <AuthRequired title="请先登录" description="管理后台仅对登录用户开放，登录后若拥有管理员或版主权限即可进入。" next="/admin" />
      </div>
    );
  }
  const adminFlag = isAdmin(user);
  const modBoards = adminFlag ? null : await getModeratedBoardIds(user.id).catch(() => new Set<string>() as Set<string>);
  if (!adminFlag && (!modBoards || modBoards.size === 0)) {
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
          description="当前账号没有管理员权限，也不是任何版块的版主，请联系管理员授予权限。"
          actionLabel="返回首页"
          actionHref="/"
        />
      </div>
    );
  }
  const visibleTabs = adminFlag ? TABS : TABS.filter((t) => t.key === "reports");
  const active = visibleTabs.some((t) => t.key === tab) ? (tab as string) : adminFlag ? "threads" : "reports";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>管理后台</span>
      </div>

      <div className="topic-toolbar">
        <div className="tab-bar">
          {visibleTabs.map((t) => (
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

      {adminFlag && active === "threads" && <ThreadsTab />}
      {adminFlag && active === "posts" && <PostsTab />}
      {adminFlag && active === "users" && <UsersTab currentUserId={user.id} />}
      {adminFlag && active === "boards" && <BoardsTab />}
      {active === "reports" && <ReportsTab boardScope={modBoards} />}
      {adminFlag && active === "words" && <WordsTab />}
      {adminFlag && active === "audit" && <AuditTab />}
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
  const mods = await db.boardModerator.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    include: { board: { select: { name: true } } },
  });
  const modMap = new Map<string, string[]>();
  for (const m of mods) {
    const arr = modMap.get(m.userId) ?? [];
    arr.push(m.board.name);
    modMap.set(m.userId, arr);
  }

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
            <LevelBadge points={u.points} role={u.role} />
            {modMap.get(u.id) && (
              <span style={{ background: "var(--brand-soft)", color: "var(--brand)", fontSize: 10, padding: "2px 6px", borderRadius: 999, border: "1px solid var(--line)" }} title={modMap.get(u.id)!.join("、")}>版主 · {modMap.get(u.id)!.slice(0, 2).join("、")}{modMap.get(u.id)!.length > 2 ? "…" : ""}</span>
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
    include: {
      _count: { select: { threads: true } },
      moderators: { include: { user: { select: { id: true, username: true, avatarUrl: true } } }, orderBy: { createdAt: "asc" } },
      categories: { orderBy: { order: "asc" } },
    },
  });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card" style={{ padding: 16, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div className="quick-title" style={{ margin: 0, fontFamily: "Space Grotesk, sans-serif" }}>新建版块</div>
            <div style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>{boards.length} 个版块 · slug 唯一，建议小写英文-数字</div>
          </div>
          <span style={{ fontSize: 10, background: "#FFF7A8", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 999, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>ADMIN ONLY</span>
        </div>
        <form action={createBoardAction} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>Slug · 地址后缀 <span style={{ fontWeight: 400, color: "var(--text-subtle)" }}>/c/</span></span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, height: 34, border: "1.5px solid var(--line)", borderRadius: 10, padding: "0 10px", background: "var(--panel)", boxShadow: "2px 2px 0 var(--line)" }}>
                <span style={{ fontSize: 12, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>/c/</span>
                <input name="slug" required pattern="[a-z0-9-]{1,32}" placeholder="general" style={{ flex: 1, border: 0, outline: "none", fontSize: 13, fontFamily: "JetBrains Mono, monospace", background: "transparent" }} />
              </span>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>名称</span>
              <input name="name" required maxLength={30} placeholder="综合讨论" style={{ height: 34, border: "1.5px solid var(--line)", borderRadius: 10, padding: "0 10px", fontSize: 13, outline: "none", boxShadow: "2px 2px 0 var(--line)" }} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>排序</span>
              <input type="number" name="order" defaultValue={boards.length + 1} min={0} max={10000} style={{ height: 34, border: "1.5px solid var(--line)", borderRadius: 10, padding: "0 8px", fontSize: 13, textAlign: "center", boxShadow: "2px 2px 0 var(--line)" }} />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>简介 <span style={{ fontWeight: 400, color: "var(--text-subtle)" }}>— 一句话，显示在版块页顶部</span></span>
            <input name="description" maxLength={200} placeholder="例如：随便聊聊 · 寻找同好" style={{ height: 34, border: "1.5px solid var(--line)", borderRadius: 10, padding: "0 10px", fontSize: 13, outline: "none", boxShadow: "2px 2px 0 var(--line)" }} />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
            <button type="submit" style={{ height: 36, padding: "0 18px", background: "var(--text)", color: "var(--panel)", border: "2px solid var(--line)", borderRadius: 999, fontSize: 13, fontWeight: 700, boxShadow: "3px 3px 0 var(--line)", fontFamily: "Space Grotesk, sans-serif", cursor: "pointer" }}>+ 创建版块</button>
          </div>
        </form>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {boards.map((b, i) => (
          <div key={b.id} className="card" style={{ overflow: "hidden", padding: 0, display: "grid" }}>
            <div style={{ display: "flex", gap: 12, padding: "14px 14px 12px", alignItems: "flex-start", borderBottom: "1.5px solid var(--line)", background: "var(--panel)" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--bg-soft)", border: "1.5px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", flexShrink: 0, boxShadow: "1px 1px 0 var(--line)" }}>#{b.order}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Link href={`/c/${b.slug}`} style={{ fontWeight: 800, fontSize: 15, fontFamily: "Space Grotesk, sans-serif", color: "var(--text)", textDecoration: "none", letterSpacing: "-0.02em" }}>{b.name}</Link>
                  <span style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace", background: "var(--panel)", border: "1.5px solid var(--line)", padding: "2px 7px", borderRadius: 999, boxShadow: "1px 1px 0 var(--line)" }}>/ {b.slug}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, background: b._count.threads > 10 ? "#FFF7A8" : "var(--panel)", border: "1.5px solid var(--line)", padding: "2px 7px", borderRadius: 999, boxShadow: "1px 1px 0 var(--line)" }}>{b._count.threads} 主题</span>
                </div>
                {b.description ? <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.5 }}>{b.description}</div> : <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 5, fontStyle: "italic" }}>暂无简介 — 在上方创建时可填写</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                <form action={moveBoardAction}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <input type="hidden" name="dir" value="up" />
                  <button disabled={i === 0} title="上移" style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid var(--line)", background: i === 0 ? "var(--bg-soft)" : "var(--panel)", color: i === 0 ? "var(--text-subtle)" : "var(--text)", fontSize: 12, fontWeight: 700, boxShadow: i === 0 ? "none" : "2px 2px 0 var(--line)", opacity: i === 0 ? 0.5 : 1, cursor: i === 0 ? "not-allowed" : "pointer" }}>↑</button>
                </form>
                <form action={moveBoardAction}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <input type="hidden" name="dir" value="down" />
                  <button disabled={i === boards.length - 1} title="下移" style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid var(--line)", background: i === boards.length - 1 ? "var(--bg-soft)" : "var(--panel)", color: i === boards.length - 1 ? "var(--text-subtle)" : "var(--text)", fontSize: 12, fontWeight: 700, boxShadow: i === boards.length - 1 ? "none" : "2px 2px 0 var(--line)", opacity: i === boards.length - 1 ? 0.5 : 1, cursor: i === boards.length - 1 ? "not-allowed" : "pointer" }}>↓</button>
                </form>
                <ConfirmForm action={deleteBoardAction} message={`确认删除版块「${b.name}（/${b.slug}）」？\n该版块下 ${b._count.threads} 个主题及其全部回帖、附件将级联删除，且相关举报将静默结案。此操作不可恢复！`}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <button type="submit" style={{ height: 30, padding: "0 10px", border: "1.5px solid #fecaca", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>删除</button>
                </ConfirmForm>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, padding: 12, background: "var(--bg)" }}>
              <div style={{ background: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 10, padding: 12, boxShadow: "2px 2px 0 var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: "var(--text)", fontFamily: "Space Grotesk, sans-serif" }}>版主 · {b.moderators.length}</span>
                  <span style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace", background: "var(--bg-soft)", border: "1px solid var(--line-soft)", padding: "1px 6px", borderRadius: 999 }}>{b.moderators.length ? `${b.moderators.length} 人` : "空"}</span>
                </div>
                {b.moderators.length ? (
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
                    {b.moderators.map((m) => (
                      <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 999, padding: "3px 6px 3px 3px", fontSize: 12, boxShadow: "1px 1px 0 var(--line)" }}>
                        <UserAvatar username={m.user.username} avatarUrl={(m.user as any).avatarUrl ?? null} size={22} radius={999} />
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{m.user.username}</span>
                        <form action={removeModeratorAction} style={{ display: "inline" }}>
                          <input type="hidden" name="boardId" value={b.id} />
                          <input type="hidden" name="userId" value={m.user.id} />
                          <button type="submit" title="移除版主" style={{ width: 18, height: 18, borderRadius: 999, border: "1px solid var(--line)", background: "var(--bg-soft)", color: "var(--text-subtle)", fontSize: 10, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </form>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 10, padding: "10px 12px", background: "var(--bg-soft)", borderRadius: 8, border: "1px dashed var(--line-soft)", textAlign: "center", lineHeight: 1.5 }}>暂无版主<br /><span style={{ fontSize: 11 }}>添加后可管理置顶/锁定/删帖与举报</span></div>
                )}
                <form action={addModeratorAction} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, height: 32, border: "1.5px solid var(--line)", borderRadius: 8, padding: "0 8px", background: "var(--panel)", boxShadow: "1px 1px 0 var(--line)" }}>
                    <span style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace" }}>@</span>
                    <input name="username" required placeholder="用户名" pattern="[a-zA-Z0-9_-]{3,20}" style={{ flex: 1, border: 0, outline: "none", fontSize: 12, background: "transparent" }} />
                  </div>
                  <button type="submit" style={{ height: 32, padding: "0 12px", background: "var(--text)", color: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 8, fontSize: 12, fontWeight: 700, boxShadow: "2px 2px 0 var(--line)", cursor: "pointer", whiteSpace: "nowrap" }}>添加</button>
                </form>
              </div>

              <div style={{ background: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 10, padding: 12, boxShadow: "2px 2px 0 var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: "var(--text)", fontFamily: "Space Grotesk, sans-serif" }}>主题分类 · {b.categories.length}</span>
                  <span style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace", background: "var(--bg-soft)", border: "1px solid var(--line-soft)", padding: "1px 6px", borderRadius: 999 }}>{b.categories.length ? `${b.categories.length} 项` : "空"}</span>
                </div>
                {b.categories.length ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {b.categories.map((c) => (
                      <span key={c.id} className={`topic-badge ${catToneClass(c.name)}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 12, borderWidth: "1.5px", boxShadow: "1px 1px 0 var(--line)" }}>
                        {c.name}
                        <form action={deleteCategoryAction} style={{ display: "inline", marginLeft: 2 }}>
                          <input type="hidden" name="categoryId" value={c.id} />
                          <button type="submit" title="删除分类" style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 10, color: "inherit", opacity: 0.6, padding: 0 }}>×</button>
                        </form>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 10, padding: "10px 12px", background: "var(--bg-soft)", borderRadius: 8, border: "1px dashed var(--line-soft)", textAlign: "center", lineHeight: 1.5 }}>暂无分类<br /><span style={{ fontSize: 11 }}>用于发帖时可选，提升筛选效率</span></div>
                )}
                <form action={createCategoryAction} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, height: 32, border: "1.5px solid var(--line)", borderRadius: 8, padding: "0 8px", background: "var(--panel)", boxShadow: "1px 1px 0 var(--line)" }}>
                    <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>#</span>
                    <input name="name" required maxLength={20} placeholder="新分类名" style={{ flex: 1, border: 0, outline: "none", fontSize: 12, background: "transparent" }} />
                  </div>
                  <button type="submit" style={{ height: 32, padding: "0 12px", background: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 8, fontSize: 12, fontWeight: 700, boxShadow: "2px 2px 0 var(--line)", cursor: "pointer", whiteSpace: "nowrap" }}>新建</button>
                </form>
              </div>
            </div>
          </div>
        ))}
        {boards.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-subtle)", borderStyle: "dashed" }}>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>还没有版块</div>
            <div style={{ fontSize: 12 }}>在上方创建第一个版块，社区就有了起点</div>
          </div>
        )}
      </div>
    </div>
  );
}


/* ---------------- 举报队列 ---------------- */

async function ReportsTab({ boardScope }: { boardScope: Set<string> | null }) {
  let reports = await db.report.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { reporter: { select: { username: true } } },
  });
  if (boardScope && reports.length) {
    const threadIdsAll = reports.filter((r) => r.targetType === "thread").map((r) => r.targetId);
    const postIdsAll = reports.filter((r) => r.targetType === "post").map((r) => r.targetId);
    const [scopeThreads, scopePosts] = await Promise.all([
      threadIdsAll.length ? db.thread.findMany({ where: { id: { in: threadIdsAll } }, select: { id: true, boardId: true } }) : Promise.resolve([] as { id: string; boardId: string }[]),
      postIdsAll.length ? db.post.findMany({ where: { id: { in: postIdsAll } }, select: { id: true, thread: { select: { boardId: true } } } }) : Promise.resolve([] as { id: string; thread: { boardId: string } }[]),
    ]);
    const threadBoardMap = new Map(scopeThreads.map((t) => [t.id, t.boardId]));
    const postBoardMap = new Map(scopePosts.map((p) => [p.id, p.thread.boardId]));
    reports = reports.filter((r) => {
      const bid = r.targetType === "thread" ? threadBoardMap.get(r.targetId) : postBoardMap.get(r.targetId);
      return !!bid && boardScope.has(bid);
    });
    reports = reports.slice(0, 100);
  }

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
          举报队列 <span>待处理 {reports.length} 条{boardScope ? " · 仅自己版块" : ""}</span>
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
