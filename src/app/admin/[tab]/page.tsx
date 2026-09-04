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
  adminResetPasswordAction,
  adminToggleDigestAction,
  adminToggleLockAction,
  adminTogglePinAction,
  adminUpdateUserAction,
  approvePostAction,
  approveThreadAction,
  awardMedalAction,
  banUserAction,
  broadcastAnnouncementAction,
  clearBoardAction,
  createBoardAction,
  createCategoryAction,
  createMedalAction,
  deleteBoardAction,
  deleteCategoryAction,
  deleteMedalAction,
  mergeBoardAction,
  revokeMedalAction,
  toggleBoardApprovalAction,
  moveCategoryAction,
  rejectPostAction,
  rejectThreadAction,
  renameCategoryAction,
  toggleBoardHiddenAction,
  toggleBoardLockedAction,
  updateBoardAction,
  moveBoardAction,
  removeModeratorAction,
  removeSensitiveWordAction,
  reviewReportAction,
  setUserRoleAction,
  unbanUserAction,
} from "../actions";
import { listActiveBans } from "@/lib/ban";
import { listSensitiveWords } from "@/lib/sensitive";
import { ConfirmForm, NativeConfirmForm } from "../ConfirmForms";
import { getModeratedBoardIds } from "@/lib/moderators";
import LevelBadge from "@/components/LevelBadge";
import UserAvatar from "@/components/UserAvatar";
import HumanizedFeedback from "@/components/HumanizedFeedback";

export const metadata = { title: "管理后台" };

const TABS = [
  { key: "threads", label: "主题管理" },
  { key: "posts", label: "帖子管理" },
  { key: "users", label: "用户管理" },
  { key: "boards", label: "版块管理" },
  { key: "reports", label: "举报队列" },
  { key: "pending", label: "待审队列" },
  { key: "medals", label: "勋章" },
  { key: "words", label: "敏感词" },
  { key: "audit", label: "审计日志" },
  { key: "stats", label: "数据统计" },
] as const;

const ERRORS: Record<string, string> = {
  invalid: "输入格式不对",
  not_found: "目标不存在或已被删除",
  forbidden: "无权操作该版块内容",
  slug_taken: "版块 slug 已被占用",
  self_role: "不能修改自己的角色",
  self_ban: "不能封禁自己",
  word_exists: "该词已存在",
  already_processed: "该举报已处理过",
  dup_moderator: "该用户已是此版块版主",
  user_not_found: "用户不存在",
  cat_exists: "同名分类已存在",
  medal_exists: "同名勋章已存在",
  medal_owned: "该用户已拥有此勋章",
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
  update_board: "编辑版块",
  toggle_hidden: "隐藏/显示",
  toggle_locked: "锁定/解锁版块",
  toggle_approval: "开启/关闭审核",
  clear_board: "清空版块",
  merge_board: "合并版块",
  review_report: "处理举报",
  ban_user: "封禁用户",
  unban_user: "解封用户",
  add_word: "添加敏感词",
  remove_word: "移除敏感词",
  set_moderator: "任命版主",
  remove_moderator: "撤免版主",
  create_category: "新建分类",
  delete_category: "删除分类",
  rename_category: "重命名分类",
  move_category: "移动分类",
  create_medal: "创建勋章",
  delete_medal: "删除勋章",
  award_medal: "授予勋章",
  revoke_medal: "移除勋章",
};

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ tab: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { tab } = await params;
  const { error } = await searchParams;
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
  // 版主可见自己版块的主题/帖子管理 + 举报/待审；用户/版块/勋章/敏感词/审计/统计仅管理员
  const visibleTabs = adminFlag
    ? TABS
    : TABS.filter((t) => t.key === "threads" || t.key === "posts" || t.key === "reports" || t.key === "pending");
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
            <Link key={t.key} href={`/admin/${t.key}`} className={`tab ${active === t.key ? "active" : ""}`}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {error && ERRORS[error] && (
        <HumanizedFeedback type="error" title="操作没成功" message={ERRORS[error]} suggestion="检查下输入，或刷新重试" />
      )}

      {active === "threads" && <ThreadsTab boardScope={modBoards} />}
      {active === "posts" && <PostsTab boardScope={modBoards} />}
      {adminFlag && active === "users" && <UsersTab currentUserId={user.id} />}
      {adminFlag && active === "boards" && <BoardsTab />}
      {active === "reports" && <ReportsTab boardScope={modBoards} />}
      {active === "pending" && <PendingTab boardScope={modBoards} />}
      {adminFlag && active === "medals" && <MedalsTab />}
      {adminFlag && active === "words" && <WordsTab />}
      {adminFlag && active === "audit" && <AuditTab />}
      {adminFlag && active === "stats" && <StatsTab />}
    </div>
  );
}

/* ---------------- 纸质面板通用组件 ---------------- */

const GROTESK = "Space Grotesk, sans-serif";
const MONO = "JetBrains Mono, monospace";

const tapeBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 11,
  fontWeight: 700,
  fontFamily: MONO,
  background: "#FFF7A8",
  color: "var(--text)",
  border: "1.5px solid var(--line)",
  borderRadius: 999,
  padding: "2px 8px",
  boxShadow: "1px 1px 0 var(--line)",
  whiteSpace: "nowrap",
};

const paperBtn: CSSProperties = {
  height: 28,
  padding: "0 12px",
  border: "1.5px solid var(--line)",
  borderRadius: 999,
  background: "var(--panel)",
  color: "var(--text)",
  fontSize: 11,
  fontWeight: 700,
  fontFamily: MONO,
  cursor: "pointer",
  boxShadow: "2px 2px 0 var(--line)",
  whiteSpace: "nowrap",
};
const paperDarkBtn: CSSProperties = { ...paperBtn, background: "var(--text)", color: "var(--panel)" };
const paperDangerBtn: CSSProperties = { ...paperBtn, color: "var(--danger)", borderColor: "#fecaca", background: "var(--danger-soft)" };

const paperInput: CSSProperties = {
  height: 28,
  border: "1.5px solid var(--line)",
  borderRadius: 8,
  padding: "0 8px",
  fontSize: 12,
  fontFamily: MONO,
  background: "var(--panel)",
  color: "var(--text)",
  boxShadow: "1px 1px 0 var(--line)",
  outline: "none",
};

/** 卡片头：quick-title + 黄色胶带计数徽章 + 右侧 mono 提示 */
function PaperCardHeader({ title, count, sub }: { title: string; count: string; sub?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "12px 14px",
        borderBottom: "1.5px solid var(--line)",
        background: "var(--panel)",
      }}
    >
      <div className="quick-title" style={{ margin: 0, fontFamily: GROTESK, fontSize: 14, letterSpacing: "-0.02em" }}>{title}</div>
      <span style={tapeBadge}>{count}</span>
      {sub && <span style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: MONO, marginLeft: "auto" }}>{sub}</span>}
    </div>
  );
}

/** 空状态：虚线纸面 + 胶带徽章 */
function PaperEmpty({ badge, title, description }: { badge: string; title: string; description: string }) {
  return (
    <li style={{ padding: 14, background: "var(--panel)" }}>
      <div
        role="status"
        aria-live="polite"
        style={{
          border: "2px dashed var(--line)",
          borderRadius: 10,
          background: "var(--bg-soft)",
          padding: "28px 16px",
          textAlign: "center",
          display: "grid",
          gap: 8,
          justifyItems: "center",
        }}
      >
        <span style={tapeBadge}>{badge}</span>
        <div style={{ fontFamily: GROTESK, fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-subtle)", maxWidth: 400, lineHeight: 1.6 }}>{description}</div>
      </div>
    </li>
  );
}

function ListCard({ children }: { children: React.ReactNode }) {
  return <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{children}</ul>;
}

function Row({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <li
      style={{
        padding: "10px 14px",
        borderBottom: last ? "0" : "1.5px solid var(--line)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        background: "var(--panel)",
      }}
    >
      {children}
    </li>
  );
}

/* ---------------- 主题管理 ---------------- */

async function ThreadsTab({ boardScope }: { boardScope: Set<string> | null }) {
  const threads = await db.thread.findMany({
    where: boardScope ? { boardId: { in: [...boardScope] } } : undefined,
    orderBy: { lastPostAt: "desc" },
    take: 100,
    include: {
      author: { select: { username: true, avatarUrl: true } },
      board: { select: { name: true, slug: true } },
      _count: { select: { posts: true } },
    },
  });

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <PaperCardHeader title="主题管理" count={`最近 ${threads.length} 条`} sub={boardScope ? "仅自己版块 · 删除需二次确认" : "删除需二次确认"} />
      <ListCard>
        {threads.map((t, i) => (
          <Row key={t.id} last={i === threads.length - 1}>
            {t.pinned && <span className="topic-badge pinned">置顶</span>}
            {(t as any).digested && <span className="topic-badge" style={{ background: "#FFE58F", border: "1.5px solid var(--line)", color: "var(--text)", fontWeight: 700 }}>精华</span>}
            {t.locked && <span className="topic-badge" style={{ background: "var(--bg-soft)", color: "var(--text-muted)", border: "1px solid var(--line)" }}>已锁</span>}
            <Link href={threadHref(t.id, t.title)} style={{ fontWeight: 700, fontSize: 13, fontFamily: GROTESK, color: "var(--text)", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}>
              {t.title}
            </Link>
            <span style={{ fontSize: 11, fontFamily: MONO, color: "var(--text-muted)", background: "var(--bg-soft)", border: "1px solid var(--line)", padding: "1px 7px", borderRadius: 999 }}>{t.board.name}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-subtle)", fontSize: 12 }}>
              <UserAvatar username={t.author.username} avatarUrl={t.author.avatarUrl ?? null} size={22} radius={999} />
              <span style={{ fontFamily: MONO }}>{t.author.username} · {t._count.posts} 帖</span>
            </span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12, fontFamily: MONO }}>{formatDate(t.lastPostAt)}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <form action={adminTogglePinAction}>
                <input type="hidden" name="threadId" value={t.id} />
                <button style={paperBtn}>{t.pinned ? "取消置顶" : "置顶"}</button>
              </form>
              <form action={adminToggleDigestAction}>
                <input type="hidden" name="threadId" value={t.id} />
                <button style={paperBtn}>{(t as any).digested ? "取消加精" : "加精"}</button>
              </form>
              <form action={adminToggleLockAction}>
                <input type="hidden" name="threadId" value={t.id} />
                <button style={paperBtn}>{t.locked ? "解锁" : "锁定"}</button>
              </form>
              <ConfirmForm
                action={adminDeleteThreadAction}
                message={`删除主题「${t.title}」？\n• 下面的回帖和附件会一起没了\n• 收藏和浏览也会失效\n• 不可恢复，确定删？`}
              >
                <input type="hidden" name="threadId" value={t.id} />
                <button type="submit" style={paperDangerBtn}>
                  删除主题
                </button>
              </ConfirmForm>
            </span>
          </Row>
        ))}
        {threads.length === 0 && (
          <PaperEmpty badge="EMPTY" title="暂无主题" description="还没有任何主题，等待用户发帖后将在此展示。" />
        )}
      </ListCard>
    </div>
  );
}

/* ---------------- 帖子管理 ---------------- */

async function PostsTab({ boardScope }: { boardScope: Set<string> | null }) {
  const posts = await db.post.findMany({
    where: boardScope ? { thread: { boardId: { in: [...boardScope] } } } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      author: { select: { username: true, avatarUrl: true } },
      thread: { select: { id: true, title: true } },
    },
  });

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <PaperCardHeader title="帖子管理" count={`最近 ${posts.length} 条`} sub={boardScope ? "仅自己版块 · 删除需二次确认" : "删除需二次确认"} />
      <ListCard>
        {posts.map((p, i) => (
          <Row key={p.id} last={i === posts.length - 1}>
            <UserAvatar username={p.author.username} avatarUrl={p.author.avatarUrl ?? null} size={28} radius={8} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <Link href={threadHref(p.thread.id, p.thread.title)} style={{ fontSize: 13, fontWeight: 700, fontFamily: GROTESK, color: "var(--brand)", textDecoration: "none" }}>
                {p.thread.title}
              </Link>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 440 }}>
                {p.contentMd.replace(/\s+/g, " ").slice(0, 80) || "（空内容）"}
              </div>
            </div>
            <span style={{ color: "var(--text-subtle)", fontSize: 12, fontFamily: MONO }}>{p.author.username}</span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12, fontFamily: MONO }}>{formatDate(p.createdAt)}</span>
            <ConfirmForm
              action={adminDeletePostAction}
              message={`删除这条回帖？\n• 作者：${p.author.username} · 主题：${p.thread.title.slice(0, 40)}\n• 附件和相关举报会一起清掉\n• 不可恢复，确定删？`}
            >
              <input type="hidden" name="postId" value={p.id} />
              <button type="submit" style={paperDangerBtn}>
                删除帖子
              </button>
            </ConfirmForm>
          </Row>
        ))}
        {posts.length === 0 && (
          <PaperEmpty badge="EMPTY" title="暂无帖子" description="还没有任何回帖，等待用户回复后将在此展示。" />
        )}
      </ListCard>
    </div>
  );
}

/* ---------------- 用户管理 ---------------- */

async function UsersTab({ currentUserId }: { currentUserId: string }) {
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { _count: { select: { posts: true, threads: true, medals: true, following: true, followers: true } as any }, medals: { include: { medal: true } } },
  });
  const bans = await listActiveBans(users.map((u) => u.id));
  const mods = await db.boardModerator.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    include: { board: { select: { name: true } } },
  });
  const modMap = new Map<string, string[]>();
  for (const m of mods) modMap.set(m.userId, [...(modMap.get(m.userId) ?? []), m.board.name]);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ padding: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontFamily: GROTESK, fontSize: 14 }}>用户管理 <span style={{ fontWeight: 400, color: "var(--text-subtle)", fontSize: 11, fontFamily: MONO }}>· {users.length} 人 · {users.filter((u) => u.role === "ADMIN").length} 管理 · {bans.size} 封禁 · 点行展开详情</span></div>
          <div style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: MONO, marginTop: 4 }}>顶部输入即时过滤 · 改资料/重置密码/封禁均需二次确认</div>
        </div>
        <input id="user-search" placeholder="搜索用户名/邮箱…" style={{ height: 34, minWidth: 220, border: "1.5px solid var(--line)", borderRadius: 10, padding: "0 12px", fontSize: 13, background: "var(--panel)", boxShadow: "2px 2px 0 var(--line)", outline: "none" }} onInput={(e) => {
          const v = (e.target as HTMLInputElement).value.toLowerCase();
          document.querySelectorAll("[data-user-row]").forEach((el) => {
            const hay = (el.getAttribute("data-hay") ?? "").toLowerCase();
            (el as HTMLElement).style.display = !v || hay.includes(v) ? "" : "none";
          });
        }} />
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <ListCard>
          {users.map((u, i) => {
            const ban = bans.get(u.id);
            const isSelf = u.id === currentUserId;
            const hay = `${u.username} ${u.email} ${u.bio ?? ""}`.toLowerCase();
            return (
              <li key={u.id} data-user-row data-hay={hay} style={{ borderBottom: i === users.length - 1 ? "none" : "1px solid var(--line-soft)", display: "grid" }}>
                <details style={{ padding: 0 }}>
                  <summary style={{ listStyle: "none", display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", cursor: "pointer" }}>
                    <UserAvatar username={u.username} avatarUrl={(u as any).avatarUrl ?? null} size={34} radius={8} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 13, fontFamily: GROTESK }}>{u.username}</span>
                        {isSelf && <span style={{ fontSize: 10, background: "var(--bg-soft)", border: "1px solid var(--line-soft)", padding: "1px 6px", borderRadius: 999, color: "var(--text-subtle)" }}>自己</span>}
                        <LevelBadge points={u.points} role={u.role} />
                        {modMap.get(u.id) && <span style={tapeBadge} title={modMap.get(u.id)!.join("、")}>MOD · {modMap.get(u.id)!.slice(0, 2).join("、")}</span>}
                        {ban && <span style={{ ...tapeBadge, background: "var(--danger-soft)", color: "var(--danger)", borderColor: "#fecaca" }} title={ban.reason}>封禁中{ban.expiresAt ? ` · 至 ${formatDate(ban.expiresAt)}` : " · 永久"}</span>}
                        {(u as any).medals?.length > 0 && <span style={{ fontSize: 11, letterSpacing: "0.04em" }}>{(u as any).medals.map((m: any) => m.medal.icon).join(" ")}</span>}
                        <span style={{ fontSize: 10, background: "var(--bg-soft)", border: "1px solid var(--line-soft)", padding: "1px 6px", borderRadius: 999, fontFamily: MONO, color: "var(--text-subtle)" }}>{u._count.threads}主题 · {u._count.posts}回帖 · {u._count?.medals ?? 0}勋章</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: MONO, display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                        <span>{u.email}</span>
                        <span>· {u.points}分</span>
                        <span>· {formatDate(u.createdAt)}</span>
                        <span style={{ background: "var(--panel)", border: "1px solid var(--line-soft)", padding: "1px 6px", borderRadius: 999 }}>关注 {(u as any)._count?.following ?? 0} · 粉丝 {(u as any)._count?.followers ?? 0}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: MONO, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span>注册IP: {(u as any).registrationIp ?? "—"}</span>
                        <span>· 末登IP: {(u as any).lastLoginIp ?? "—"}</span>
                        <span>· 末活跃IP: {(u as any).lastActiveIp ?? "—"}</span>
                        {u.bio ? <span>· {u.bio.slice(0, 24)}{u.bio.length > 24 ? "…" : ""}</span> : <span>· 无简介</span>}
                      </div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-subtle)", border: "1px solid var(--line-soft)", padding: "2px 8px", borderRadius: 999, background: "var(--bg-soft)", flexShrink: 0 }}>详情 ▾</span>
                  </summary>
                  <div style={{ padding: "12px 14px", background: "var(--bg-soft)", borderTop: "1px solid var(--line-soft)", display: "grid", gap: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                      <div style={{ background: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 10, padding: 12, boxShadow: "2px 2px 0 var(--line)" }}>
                        <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 8, fontFamily: GROTESK }}>公开资料 · 链接 /u/{u.username} 可见</div>
                        <div style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: MONO, marginBottom: 8, wordBreak: "break-all" }}>ID: {u.id.slice(0, 8)}… · 注册: {formatDate(u.createdAt)} · 上次活跃: {(u as any).lastActiveAt ? formatDate((u as any).lastActiveAt) : "—"} · 验证: {u.emailVerified ? "已验" : "未验"}</div>
                        {(u as any).bio ? <div style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--bg-soft)", border: "1px solid var(--line-soft)", borderRadius: 8, padding: "8px 10px", marginBottom: 8, whiteSpace: "pre-wrap" }}>{(u as any).bio}</div> : <div style={{ fontSize: 12, color: "var(--text-subtle)", background: "var(--bg-soft)", border: "1px dashed var(--line-soft)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>无简介</div>}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                          {(u as any).medals?.map((m: any) => (
                            <span key={m.id} style={{ display: "inline-flex", gap: 4, alignItems: "center", background: m.medal.color, border: "1.5px solid var(--line)", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{m.medal.icon} {m.medal.name}</span>
                          ))}
                          {(u as any).medals?.length === 0 && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>暂无勋章 — 可在勋章 Tab 授予</span>}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Link href={`/u/${encodeURIComponent(u.username)}`} style={{ fontSize: 12, color: "var(--brand)", fontWeight: 600, border: "1px solid var(--line)", padding: "4px 8px", borderRadius: 999, background: "var(--panel)" }}>查看主页 →</Link>
                          <Link href={`/u/${encodeURIComponent(u.username)}?tab=favs`} style={{ fontSize: 11, color: "var(--text-subtle)", border: "1px solid var(--line-soft)", padding: "4px 8px", borderRadius: 999, background: "var(--panel)" }}>{u._count.threads} 收藏</Link>
                        </div>
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        <details style={{ background: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 10, padding: 10 }} open>
                          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700 }}>修改资料</summary>
                          <form action={adminUpdateUserAction} style={{ display: "grid", gap: 8, marginTop: 10 }}>
                            <input type="hidden" name="userId" value={u.id} />
                            <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 600 }}>用户名</span><input name="username" defaultValue={u.username} pattern="[a-zA-Z0-9_-]{3,20}" style={{ ...paperInput, height: 30 }} /></label>
                            <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 600 }}>邮箱</span><input name="email" defaultValue={u.email} type="email" style={{ ...paperInput, height: 30 }} /></label>
                            <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 600 }}>简介</span><textarea name="bio" defaultValue={(u as any).bio ?? ""} maxLength={200} rows={2} style={{ ...paperInput, height: 60, resize: "vertical", padding: "8px 10px" }} /></label>
                            <button type="submit" style={paperDarkBtn}>保存资料</button>
                          </form>
                        </details>
                        <details style={{ background: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 10, padding: 10 }}>
                          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--danger)" }}>重置密码</summary>
                          <form action={adminResetPasswordAction} style={{ display: "flex", gap: 6, marginTop: 10 }}>
                            <input type="hidden" name="userId" value={u.id} />
                            <input name="password" type="password" required minLength={8} placeholder="新密码 ≥8位" style={{ flex: 1, ...paperInput, height: 30 }} />
                            <button type="submit" style={paperDangerBtn}>重置</button>
                          </form>
                          <div style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 6 }}>重置后该用户所有会话将失效，需重新登录</div>
                        </details>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 8, borderTop: "1px dashed var(--line-soft)" }}>
                      {ban ? (
                        !isSelf && <NativeConfirmForm action={unbanUserAction} message={`解封「${u.username}」？\n解封后他就能正常登录和发帖了，历史封禁记录会保留。`}><input type="hidden" name="userId" value={u.id} /><button type="submit" style={paperBtn}>解封</button></NativeConfirmForm>
                      ) : (
                        !isSelf && <ConfirmForm action={banUserAction} message={`封禁「${u.username}」？\n封禁后他无法登录/发帖，历史内容保留，时间到了自动解封，永久封禁请留空天数。`} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="hidden" name="userId" value={u.id} /><input name="reason" placeholder="原因" maxLength={200} style={{ ...paperInput, width: 100 }} /><input type="number" name="durationDays" placeholder="天数" style={{ ...paperInput, width: 70 }} /><button type="submit" style={paperDangerBtn}>封禁</button></ConfirmForm>
                      )}
                      {!isSelf && (
                        <ConfirmForm action={setUserRoleAction} message={u.role === "ADMIN" ? `取消「${u.username}」的管理员？\n他将失去后台所有权限，但仍是普通会员。` : `设「${u.username}」为管理员？\n他将获得置顶/删帖/封禁等全部后台权限，请确认信任。`}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="role" value={u.role === "ADMIN" ? "USER" : "ADMIN"} /><button type="submit" style={paperBtn}>{u.role === "ADMIN" ? "取消管理员" : "设为管理员"}</button></ConfirmForm>
                      )}
                      <form action={addPointsAction} style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="number" name="points" defaultValue={10} style={{ ...paperInput, width: 70 }} />
                        <button style={paperBtn}>加分</button>
                      </form>
                      <Link href={`/u/${encodeURIComponent(u.username)}`} style={{ fontSize: 12, color: "var(--brand)", fontWeight: 600 }}>查看主页 →</Link>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ListCard>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: MONO, textAlign: "center" }}>点行展开详情 · 顶部输入即时过滤 · 邮箱/用户名改后需唯一 · 密码重置后旧会话失效</div>
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayGroups = await db.thread.groupBy({ by: ["boardId"], where: { createdAt: { gte: today } }, _count: { _all: true } }).catch(() => [] as { boardId: string; _count: { _all: number } }[]);
  const todayMap = new Map(todayGroups.map((g) => [g.boardId, g._count._all]));

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
                  {(b as unknown as { isHidden: boolean }).isHidden && <span style={{ fontSize: 10, background: "var(--text)", color: "var(--panel)", padding: "2px 6px", borderRadius: 999, fontWeight: 700 }}>隐藏</span>}
                  {(b as unknown as { isLocked: boolean }).isLocked && <span style={{ fontSize: 10, background: "#FFF7A8", border: "1.5px solid var(--line)", padding: "2px 6px", borderRadius: 999, fontWeight: 700 }}>锁定</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, background: b._count.threads > 10 ? "#FFF7A8" : "var(--panel)", border: "1.5px solid var(--line)", padding: "2px 7px", borderRadius: 999, boxShadow: "1px 1px 0 var(--line)" }}>{b._count.threads} 主题 · 今日 {todayMap.get(b.id) ?? 0}</span>
                </div>
                {b.description ? <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.5 }}>{b.description}</div> : <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 5, fontStyle: "italic" }}>暂无简介 — 在编辑中可填写</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
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
                <form action={toggleBoardHiddenAction}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <button title={(b as unknown as { isHidden: boolean }).isHidden ? "取消隐藏" : "设为隐藏"} style={{ height: 30, padding: "0 8px", border: "1.5px solid var(--line)", background: (b as unknown as { isHidden: boolean }).isHidden ? "var(--text)" : "var(--panel)", color: (b as unknown as { isHidden: boolean }).isHidden ? "var(--panel)" : "var(--text)", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{(b as unknown as { isHidden: boolean }).isHidden ? "已隐藏" : "隐藏"}</button>
                </form>
                <form action={toggleBoardLockedAction}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <button title={(b as unknown as { isLocked: boolean }).isLocked ? "解锁" : "锁定发帖"} style={{ height: 30, padding: "0 8px", border: "1.5px solid var(--line)", background: (b as unknown as { isLocked: boolean }).isLocked ? "#FFF7A8" : "var(--panel)", color: "var(--text)", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{(b as unknown as { isLocked: boolean }).isLocked ? "已锁定" : "锁定"}</button>
                </form>
                <form action={toggleBoardApprovalAction}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <button title={(b as unknown as { requireApproval: boolean }).requireApproval ? "关闭审核" : "开启审核"} style={{ height: 30, padding: "0 8px", border: "1.5px solid var(--line)", background: (b as unknown as { requireApproval: boolean }).requireApproval ? "#EDE9FE" : "var(--panel)", color: (b as unknown as { requireApproval: boolean }).requireApproval ? "#7C3AED" : "var(--text)", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{(b as unknown as { requireApproval: boolean }).requireApproval ? "需审核" : "免审"}</button>
                </form>
                <ConfirmForm action={deleteBoardAction} message={`删除版块「${b.name}」？\n• 该版块下 ${b._count.threads} 个主题 + 全部回帖/附件会一起没了\n• 相关举报会静默结案\n• 版块本身消失，不可恢复，确定吗？`}>
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
                  <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
                    {b.categories.map((c, idx) => (
                      <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", background: "var(--bg-soft)", border: "1px solid var(--line-soft)", borderRadius: 8, padding: "6px 8px" }}>
                        <span className={`topic-badge ${catToneClass(c.name)}`} style={{ fontSize: 11, flexShrink: 0 }}>{c.name}</span>
                        <span style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace" }}>#{c.order}</span>
                        <form action={renameCategoryAction} style={{ display: "flex", gap: 4, flex: 1, marginLeft: 6 }}>
                          <input type="hidden" name="categoryId" value={c.id} />
                          <input name="name" defaultValue={c.name} maxLength={20} style={{ flex: 1, height: 24, border: "1px solid var(--line)", borderRadius: 6, padding: "0 6px", fontSize: 11, background: "var(--panel)" }} />
                          <button type="submit" style={{ height: 24, padding: "0 6px", border: "1px solid var(--line)", background: "var(--panel)", borderRadius: 6, fontSize: 10, cursor: "pointer" }}>改名</button>
                        </form>
                        <div style={{ display: "flex", gap: 4 }}>
                          <form action={moveCategoryAction}>
                            <input type="hidden" name="categoryId" value={c.id} />
                            <input type="hidden" name="dir" value="up" />
                            <button disabled={idx === 0} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid var(--line)", background: idx === 0 ? "var(--bg-soft)" : "var(--panel)", opacity: idx === 0 ? 0.4 : 1, cursor: idx === 0 ? "not-allowed" : "pointer", fontSize: 10 }}>↑</button>
                          </form>
                          <form action={moveCategoryAction}>
                            <input type="hidden" name="categoryId" value={c.id} />
                            <input type="hidden" name="dir" value="down" />
                            <button disabled={idx === b.categories.length - 1} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid var(--line)", background: idx === b.categories.length - 1 ? "var(--bg-soft)" : "var(--panel)", opacity: idx === b.categories.length - 1 ? 0.4 : 1, cursor: idx === b.categories.length - 1 ? "not-allowed" : "pointer", fontSize: 10 }}>↓</button>
                          </form>
                          <form action={deleteCategoryAction}>
                            <input type="hidden" name="categoryId" value={c.id} />
                            <button type="submit" style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #fecaca", background: "var(--danger-soft)", color: "var(--danger)", fontSize: 10, cursor: "pointer" }}>×</button>
                          </form>
                        </div>
                      </div>
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

            <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "var(--bg-soft)", borderTop: "1.5px solid var(--line)", flexWrap: "wrap", alignItems: "center" }}>
              <details style={{ flex: 1 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--text)" }}>编辑版块</summary>
                <form action={updateBoardAction} style={{ display: "grid", gap: 8, marginTop: 10, padding: 10, background: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 8 }}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 600 }}>Slug</span><input name="slug" defaultValue={b.slug} required pattern="[a-z0-9-]{1,32}" style={{ height: 30, border: "1px solid var(--line)", borderRadius: 6, padding: "0 8px", fontSize: 12 }} /></label>
                    <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 600 }}>名称</span><input name="name" defaultValue={b.name} required maxLength={30} style={{ height: 30, border: "1px solid var(--line)", borderRadius: 6, padding: "0 8px", fontSize: 12 }} /></label>
                  </div>
                  <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 600 }}>简介</span><input name="description" defaultValue={b.description ?? ""} maxLength={200} style={{ height: 30, border: "1px solid var(--line)", borderRadius: 6, padding: "0 8px", fontSize: 12 }} /></label>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="submit" style={{ height: 30, padding: "0 12px", background: "var(--text)", color: "var(--panel)", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>保存</button></div>
                </form>
              </details>
              <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
                <ConfirmForm action={clearBoardAction} message={`清空「${b.name}」？\n• 会删光该版块下 ${b._count.threads} 个主题（回帖/附件一起）\n• 版块壳子还在，可继续用\n• 不可恢复，确定清空？`}>
                  <input type="hidden" name="boardId" value={b.id} />
                  <button type="submit" style={{ height: 28, padding: "0 10px", border: "1.5px solid var(--line)", background: "var(--panel)", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>清空</button>
                </ConfirmForm>
                <details style={{ position: "relative" }}>
                  <summary style={{ listStyle: "none", height: 28, padding: "0 10px", border: "1.5px solid var(--line)", background: "var(--panel)", borderRadius: 6, fontSize: 11, cursor: "pointer", display: "inline-flex", alignItems: "center" }}>合并</summary>
                  <form action={mergeBoardAction} style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 8, padding: 10, boxShadow: "4px 4px 0 var(--line)", display: "grid", gap: 8, width: 220, zIndex: 10 }}>
                    <input type="hidden" name="sourceId" value={b.id} />
                    <span style={{ fontSize: 11, fontWeight: 600 }}>合并到：</span>
                    <select name="targetId" required style={{ height: 30, border: "1px solid var(--line)", borderRadius: 6, padding: "0 6px", fontSize: 12 }}>
                      <option value="">选择目标版块</option>
                      {boards.filter((x) => x.id !== b.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.name} /{x.slug}</option>
                      ))}
                    </select>
                    <button type="submit" style={{ height: 28, background: "var(--text)", color: "var(--panel)", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>确认合并</button>
                    <span style={{ fontSize: 10, color: "var(--text-subtle)" }}>源版块主题将移至目标版块，分类置空</span>
                  </form>
                </details>
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
    include: { reporter: { select: { username: true, avatarUrl: true } } },
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
      <PaperCardHeader title="举报队列" count={`待处理 ${reports.length} 条`} sub={boardScope ? "仅自己版块" : "按时间升序 · 最早优先"} />
      <ListCard>
        {reports.map((r, i) => {
          const isThread = r.targetType === "thread";
          const targetTitle = isThread ? threadMap.get(r.targetId) : threadTitleMap.get(postMap.get(r.targetId) ?? "");
          return (
            <Row key={r.id} last={i === reports.length - 1}>
              <span className="topic-badge" style={{ background: "#FFF7A8", color: "var(--text)", border: "1.5px solid var(--line)", fontFamily: MONO, boxShadow: "1px 1px 0 var(--line)" }}>
                {isThread ? "主题" : "帖子"}
              </span>
              <div style={{ minWidth: 0, maxWidth: 360 }}>
                <Link
                  href={threadHref(isThread ? r.targetId : postMap.get(r.targetId) ?? "", targetTitle ?? "")}
                  style={{ fontSize: 13, fontWeight: 700, fontFamily: GROTESK, color: targetTitle ? "var(--text)" : "var(--text-subtle)" }}
                >
                  {targetTitle ?? "（内容已不存在）"}
                </Link>
                <div style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>
                  {r.reason}
                </div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-subtle)", fontSize: 12 }}>
                <UserAvatar username={r.reporter.username} avatarUrl={r.reporter.avatarUrl ?? null} size={20} radius={999} />
                <span>举报：<span style={{ fontFamily: MONO }}>{r.reporter.username}</span></span>
              </span>
              <span style={{ color: "var(--text-subtle)", fontSize: 12, fontFamily: MONO }}>{formatDate(r.createdAt)}</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <ConfirmForm
                  action={reviewReportAction}
                  message={`删除被举报的${isThread ? "主题" : "帖子"}并结案？\n• 目标内容会直接删掉，举报人会收到“已处理”通知\n• 删了就回不来了，确定吗？`}
                >
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="action" value={isThread ? "delete_thread" : "delete_post"} />
                  <button type="submit" style={paperDangerBtn}>
                    删除目标
                  </button>
                </ConfirmForm>
                <form action={reviewReportAction}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="action" value="ignore" />
                  <button style={paperBtn}>忽略</button>
                </form>
                <form action={reviewReportAction}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <input type="hidden" name="action" value="reject" />
                  <button style={paperBtn}>驳回</button>
                </form>
              </span>
            </Row>
          );
        })}
        {reports.length === 0 && (
          <PaperEmpty badge="0 条" title="暂无待处理" description="队列已清空，没有待处理的举报。" />
        )}
      </ListCard>
    </div>
  );
}

/* ---------------- 待审队列 ---------------- */

async function PendingTab({ boardScope }: { boardScope: Set<string> | null }) {
  // 版块范围直接进 where：之前只 include board 没取 boardId，
  // 内存过滤 boardScope.has(undefined) 恒 false，版主永远看不到待审。
  const scopeIds = boardScope ? [...boardScope] : null;
  const threads = await db.thread.findMany({
    where: { status: "pending", ...(scopeIds ? { boardId: { in: scopeIds } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: { author: { select: { username: true } }, board: { select: { name: true, slug: true } } },
  });
  const posts = await db.post.findMany({
    where: { status: "pending", ...(scopeIds ? { thread: { boardId: { in: scopeIds } } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: { author: { select: { username: true } }, thread: { select: { id: true, title: true, board: { select: { name: true, slug: true } } } } },
  });
  const total = threads.length + posts.length;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="quick-title" style={{ margin: 0 }}>待审队列 <span>主题 {threads.length} · 回帖 {posts.length} {boardScope ? "· 仅自己版块" : ""}</span></div>
          <span style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace" }}>新人/版块审核/敏感词 → 待审</span>
        </div>
        {threads.length === 0 && posts.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>暂无待审</div>
            <div style={{ fontSize: 12 }}>新人、需审核版块或命中敏感词的内容会在此出现</div>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {threads.map((t) => (
              <li key={t.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span className="topic-badge" style={{ background: "#FFF7A8", border: "1.5px solid var(--line)", color: "var(--text)", fontWeight: 700 }}>待审主题</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link href={threadHref(t.id, t.title)} style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{t.title}</Link>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 2 }}>{t.board.name} · {t.author.username} · {formatDate(t.createdAt)}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <form action={approveThreadAction}><input type="hidden" name="threadId" value={t.id} /><button style={{ height: 28, padding: "0 10px", background: "var(--text)", color: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 8, fontSize: 12, fontWeight: 700, boxShadow: "2px 2px 0 var(--line)", cursor: "pointer" }}>通过</button></form>
                  <ConfirmForm action={rejectThreadAction} message={`驳回并删除主题「${t.title}」？\n• 主题 + 楼下所有回帖/附件都会被删\n• 作者会收到“被驳回”通知\n• 不可恢复，确定吗？`}><input type="hidden" name="threadId" value={t.id} /><button type="submit" style={{ height: 28, padding: "0 10px", background: "var(--danger-soft)", color: "var(--danger)", border: "1.5px solid #fecaca", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>驳回</button></ConfirmForm>
                </div>
              </li>
            ))}
            {posts.map((p) => (
              <li key={p.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span className="topic-badge" style={{ background: "#FFF1F0", border: "1.5px solid var(--line)", color: "var(--danger)", fontWeight: 700 }}>待审回帖</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link href={threadHref(p.thread.id, p.thread.title)} style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{p.thread.title}</Link>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420, marginTop: 2 }}>{p.contentMd.slice(0, 80)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 2 }}>{p.thread.board.name} · {p.author.username} · {formatDate(p.createdAt)}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <form action={approvePostAction}><input type="hidden" name="postId" value={p.id} /><button style={{ height: 28, padding: "0 10px", background: "var(--text)", color: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 8, fontSize: 12, fontWeight: 700, boxShadow: "2px 2px 0 var(--line)", cursor: "pointer" }}>通过</button></form>
                  <ConfirmForm action={rejectPostAction} message={`驳回这条回帖？\n• 回帖 + 附件会被删，楼主会收到通知\n• 不可恢复，确定吗？`}><input type="hidden" name="postId" value={p.id} /><button type="submit" style={{ height: 28, padding: "0 10px", background: "var(--danger-soft)", color: "var(--danger)", border: "1.5px solid #fecaca", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>驳回</button></ConfirmForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------- 勋章 ---------------- */

async function MedalsTab() {
  const medals = await db.medal.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { users: true } } } });
  const users = await db.user.findMany({ orderBy: { username: "asc" }, take: 20, select: { id: true, username: true } });
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ padding: 16 }}>
        <div className="quick-title" style={{ margin: "0 0 12px", fontFamily: "Space Grotesk, sans-serif" }}>新建勋章 <span>{medals.length} 枚</span></div>
        <form action={createMedalAction} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 120px", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 700 }}>名称</span><input name="name" required maxLength={20} placeholder="勋章名" style={{ height: 32, border: "1.5px solid var(--line)", borderRadius: 8, padding: "0 10px", fontSize: 13 }} /></label>
            <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 700 }}>图标</span><input name="icon" placeholder="🏅" maxLength={4} style={{ height: 32, border: "1.5px solid var(--line)", borderRadius: 8, padding: "0 10px", fontSize: 13, textAlign: "center" }} /></label>
            <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 700 }}>颜色</span><input name="color" type="color" defaultValue="#FFF7A8" style={{ height: 32, width: "100%", border: "1.5px solid var(--line)", borderRadius: 8, padding: 2 }} /></label>
            <div style={{ display: "flex", alignItems: "end" }}><button type="submit" style={{ height: 32, flex: 1, background: "var(--text)", color: "var(--panel)", border: "1.5px solid var(--line)", borderRadius: 8, fontWeight: 700, boxShadow: "2px 2px 0 var(--line)", cursor: "pointer" }}>创建</button></div>
          </div>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 700 }}>描述 <span style={{ fontWeight: 400, color: "var(--text-subtle)" }}>可选</span></span><input name="description" maxLength={100} placeholder="一句话介绍" style={{ height: 32, border: "1.5px solid var(--line)", borderRadius: 8, padding: "0 10px", fontSize: 13 }} /></label>
        </form>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)" }}><div className="quick-title" style={{ margin: 0 }}>勋章列表 <span>{medals.length} 枚 · 点击授予</span></div></div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {medals.map((m) => (
            <li key={m.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: m.color, border: "1.5px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: "1px 1px 0 var(--line)" }}>{m.icon}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{m.name} <span style={{ fontWeight: 400, color: "var(--text-subtle)", fontSize: 11 }}>· {m._count.users} 人拥有</span></div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.description ?? "暂无描述"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <form action={awardMedalAction} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="hidden" name="medalId" value={m.id} />
                  <select name="userId" required style={{ height: 28, border: "1px solid var(--line)", borderRadius: 6, padding: "0 6px", fontSize: 11, minWidth: 100 }}>
                    <option value="">选用户</option>
                    {users.map((u) => (<option key={u.id} value={u.id}>{u.username}</option>))}
                  </select>
                  <input name="reason" placeholder="理由" maxLength={100} style={{ height: 28, width: 90, border: "1px solid var(--line)", borderRadius: 6, padding: "0 6px", fontSize: 11 }} />
                  <button type="submit" style={{ height: 28, padding: "0 8px", background: "var(--text)", color: "var(--panel)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>授予</button>
                </form>
                <ConfirmForm action={deleteMedalAction} message={`删除勋章「${m.name}」？\n• 已拥有它的用户会一并失去\n• 不可恢复，确定删？`}><input type="hidden" name="id" value={m.id} /><button type="submit" style={{ height: 28, padding: "0 8px", border: "1.5px solid #fecaca", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>删除</button></ConfirmForm>
              </div>
            </li>
          ))}
          {medals.length === 0 && <li style={{ padding: 24, textAlign: "center", color: "var(--text-subtle)" }}>暂无勋章</li>}
        </ul>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="quick-title" style={{ margin: "0 0 10px" }}>移除勋章</div>
        <form action={revokeMedalAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select name="userId" required style={{ height: 32, border: "1.5px solid var(--line)", borderRadius: 8, padding: "0 8px", fontSize: 12, minWidth: 120 }}><option value="">用户</option>{users.map((u) => (<option key={u.id} value={u.id}>{u.username}</option>))}</select>
          <select name="medalId" required style={{ height: 32, border: "1.5px solid var(--line)", borderRadius: 8, padding: "0 8px", fontSize: 12, minWidth: 120 }}><option value="">勋章</option>{medals.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}</select>
          <button type="submit" style={{ height: 32, padding: "0 12px", border: "1.5px solid var(--line)", background: "var(--panel)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>移除</button>
        </form>
      </div>
    </div>
  );
}

/* ---------------- 审计日志 ---------------- */

async function AuditTab() {
  const logs = await db.auditLog
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { username: true, avatarUrl: true } } },
    })
    .catch(() => []);
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <PaperCardHeader title="审计日志" count={`最近 ${logs.length} 条`} sub="仅展示最近 50 条" />
      <ListCard>
        {logs.map((l, i) => (
          <Row key={l.id} last={i === logs.length - 1}>
            <span
              className="topic-badge"
              style={{
                background: l.action.startsWith("delete") ? "var(--danger-soft)" : "#FFF7A8",
                color: l.action.startsWith("delete") ? "var(--danger)" : "var(--text)",
                border: l.action.startsWith("delete") ? "1.5px solid #fecaca" : "1.5px solid var(--line)",
                fontFamily: MONO,
                boxShadow: "1px 1px 0 var(--line)",
              }}
            >
              {ACTION_LABELS[l.action] ?? l.action}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, fontFamily: GROTESK, color: "var(--text)" }}>
              <UserAvatar username={l.actor.username} avatarUrl={l.actor.avatarUrl ?? null} size={22} radius={999} />
              {l.actor.username}
            </span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12, fontFamily: MONO }}>
              {l.targetType}
              {l.targetId ? ` · ${l.targetId.slice(-6)}` : ""}
              {l.detail ? ` · ${l.detail.slice(0, 40)}` : ""}
            </span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12, fontFamily: MONO, marginLeft: "auto" }}>{formatDate(l.createdAt)}</span>
          </Row>
        ))}
        {logs.length === 0 && (
          <PaperEmpty badge="0 条" title="暂无审计记录" description="管理操作将自动留痕，最近 50 条在此展示。" />
        )}
      </ListCard>
    </div>
  );
}

/* ---------------- 数据统计 ---------------- */

async function StatsTab() {
  const [userCount, threadCount, postCount, viewAgg] = await Promise.all([
    db.user.count(),
    db.thread.count(),
    db.post.count(),
    db.thread.aggregate({ _sum: { views: true } }).catch(() => ({ _sum: { views: 0 } } as any)),
  ]);
  const totalViews = (viewAgg as any)._sum?.views ?? 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last7 = new Date(today);
  last7.setDate(today.getDate() - 6);

  const [todayThreads, todayPosts, todayUsers] = await Promise.all([
    db.thread.count({ where: { createdAt: { gte: today } } }),
    db.post.count({ where: { createdAt: { gte: today } } }),
    db.user.count({ where: { createdAt: { gte: today } } }),
  ]);

  // 近7日趋势
  const [threads7, posts7, users7] = await Promise.all([
    db.thread.findMany({ where: { createdAt: { gte: last7 } }, select: { createdAt: true } }),
    db.post.findMany({ where: { createdAt: { gte: last7 } }, select: { createdAt: true } }),
    db.user.findMany({ where: { createdAt: { gte: last7 } }, select: { createdAt: true } }),
  ]);
  const dayLabels: string[] = [];
  const tMap = new Map<string, number>();
  const pMap = new Map<string, number>();
  const uMap = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(last7);
    d.setDate(last7.getDate() + i);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    dayLabels.push(key);
    tMap.set(key, 0);
    pMap.set(key, 0);
    uMap.set(key, 0);
  }
  for (const t of threads7) {
    const k = `${t.createdAt.getMonth() + 1}/${t.createdAt.getDate()}`;
    tMap.set(k, (tMap.get(k) ?? 0) + 1);
  }
  for (const t of posts7) {
    const k = `${t.createdAt.getMonth() + 1}/${t.createdAt.getDate()}`;
    pMap.set(k, (pMap.get(k) ?? 0) + 1);
  }
  for (const t of users7) {
    const k = `${t.createdAt.getMonth() + 1}/${t.createdAt.getDate()}`;
    uMap.set(k, (uMap.get(k) ?? 0) + 1);
  }
  const maxDay = Math.max(1, ...[...tMap.values(), ...pMap.values(), ...uMap.values()]);

  const boards = await db.board.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { threads: true } } },
  });
  const boardPostCounts = await db.post.groupBy({ by: ["threadId"], _count: { _all: true } }).catch(() => [] as any[]);
  // 简化：按版块统计帖子需联表，改为按版块查 thread 数已够，帖子数用 _count 近似（已在 boards._count）

  const topThreadsViews = await db.thread.findMany({
    orderBy: { views: "desc" },
    take: 5,
    select: { id: true, title: true, views: true, board: { select: { name: true } }, _count: { select: { posts: true } } },
  });
  const topThreadsReplies = await db.thread.findMany({
    orderBy: { lastPostAt: "desc" },
    take: 5,
    select: { id: true, title: true, views: true, board: { select: { name: true } }, _count: { select: { posts: true } } },
  });
  const topUsers = await db.user.findMany({
    orderBy: { points: "desc" },
    take: 5,
    select: { username: true, points: true, avatarUrl: true, _count: { select: { threads: true, posts: true } } },
  });

  const statCard = (label: string, value: string | number, sub: string, icon: string, bg: string) => (
    <div style={{ background: "var(--panel)", border: "2px solid var(--line)", borderRadius: 12, padding: 14, boxShadow: "3px 3px 0 var(--line)", display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, border: "1.5px solid var(--line)" }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace" }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace" }}>{sub}</div>
    </div>
  );

  const bar = (label: string, value: number, max: number, color: string) => (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace" }}><span>{label}</span><span style={{ fontWeight: 700, color: "var(--text)" }}>{value}</span></div>
      <div style={{ height: 8, background: "var(--bg-soft)", border: "1px solid var(--line-soft)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${Math.round((value / max) * 100)}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {statCard("总用户", userCount, `今日 +${todayUsers}`, "👥", "#FFF7A8")}
        {statCard("主题", threadCount, `今日 +${todayThreads}`, "📄", "#EDE9FE")}
        {statCard("回帖", postCount, `今日 +${todayPosts}`, "💬", "#FFE4E6")}
        {statCard("总浏览", totalViews, "全站累计", "👁", "#DCFCE7")}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="quick-title" style={{ margin: "0 0 12px", fontFamily: "Space Grotesk, sans-serif" }}>近7日趋势 <span>发帖/回帖/注册</span></div>
        <div style={{ display: "grid", gap: 10 }}>
          {dayLabels.map((d) => (
            <div key={d} style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--text-subtle)", textAlign: "right" }}>{d}</span>
              <div style={{ display: "grid", gap: 4 }}>
                {bar(`主题 ${tMap.get(d) ?? 0}`, tMap.get(d) ?? 0, maxDay, "#7C3AED")}
                {bar(`回帖 ${pMap.get(d) ?? 0}`, pMap.get(d) ?? 0, maxDay, "#FF3B30")}
                {bar(`新用户 ${uMap.get(d) ?? 0}`, uMap.get(d) ?? 0, maxDay, "#16A34A")}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace" }}>数据源：Post/Thread/User createdAt · 隐藏版块已过滤</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="quick-title" style={{ margin: "0 0 12px" }}>版块分布 <span>{boards.length} 版块</span></div>
          <div style={{ display: "grid", gap: 8 }}>
            {boards.map((b) => {
              const max = Math.max(1, ...boards.map((x) => x._count.threads));
              const pct = Math.round((b._count.threads / max) * 100);
              return (
                <div key={b.id} style={{ display: "grid", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>{b.name} <span style={{ color: "var(--text-subtle)", fontWeight: 400, fontFamily: "JetBrains Mono, monospace" }}>/ {b.slug}</span></span>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{b._count.threads} 主题</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-soft)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--line-soft)" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--text)", borderRadius: 999 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="quick-title" style={{ margin: 0 }}>热度 Top5 · 浏览</div>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {topThreadsViews.map((t, i) => (
                <Link key={t.id} href={threadHref(t.id, t.title)} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", border: "1px solid var(--line-soft)", borderRadius: 8, background: "var(--bg-soft)", textDecoration: "none" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: i === 0 ? "#FFF7A8" : "var(--panel)", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  <span style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace" }}>{t.views} 浏览 · {Math.max(0, t._count.posts - 1)} 回复</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="quick-title" style={{ margin: 0 }}>积分 Top5</div>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {topUsers.map((u, i) => (
                <Link key={u.username} href={`/u/${u.username}`} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", border: "1px solid var(--line-soft)", borderRadius: 8, background: "var(--bg-soft)", textDecoration: "none" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: i === 0 ? "#FFF7A8" : "var(--panel)", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{u.username}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace" }}>{u.points} 分 · {u._count.threads} 主题</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: "JetBrains Mono, monospace" }}>RSS: <Link href="/rss.xml" style={{ color: "var(--brand)", fontWeight: 600 }}>/rss.xml</Link> · <Link href="/atom.xml" style={{ color: "var(--brand)" }}>/atom.xml</Link> · <Link href="/feed.json" style={{ color: "var(--brand)" }}>/feed.json</Link> · OG: <code style={{ background: "var(--bg-soft)", padding: "1px 4px", borderRadius: 4 }}>/api/og?title=...&board=...&author=...</code></span>
        <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>数据 60s 缓存，隐藏版块已过滤</span>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="quick-title" style={{ margin: "0 0 4px" }}>全站公告 <span>发给全部 {userCount} 位用户</span></div>
        <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "0 0 10px" }}>每人收一条系统通知（铃铛 30s 内刷新）。只发重要事：停机、规则变更、活动。</p>
        <form action={broadcastAnnouncementAction} style={{ display: "grid", gap: 8 }}>
          <input name="title" required maxLength={50} placeholder="标题（≤50 字），如：今晚 2 点停机维护" style={{ ...paperInput }} />
          <input name="body" maxLength={500} placeholder="正文可选（≤500 字）" style={{ ...paperInput }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input name="link" maxLength={200} placeholder="站内链接可选，如 /t/abc123" style={{ ...paperInput, flex: 1, minWidth: 200 }} />
            <button type="submit" style={paperDarkBtn}>📢 全站发送</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- 敏感词 ---------------- */

async function WordsTab() {
  const words = await listSensitiveWords();
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <PaperCardHeader title="敏感词" count={`${words.length} 条`} sub="发帖/回帖/私信命中即拦截 · 增删后 1 分钟内生效" />
      <form
        action={addSensitiveWordAction}
        style={{ display: "flex", gap: 8, padding: "12px 14px", borderBottom: "1.5px solid var(--line)", alignItems: "center", flexWrap: "wrap", background: "var(--bg-soft)" }}
      >
        <input
          name="word"
          required
          maxLength={30}
          placeholder="输入要拦截的词（≤30 字，自动转小写去重）"
          style={{ ...paperInput, flex: 1, minWidth: 200 }}
        />
        <button type="submit" style={paperDarkBtn}>+ 添加</button>
      </form>
      <ListCard>
        {words.map((w, i) => (
          <Row key={w.id} last={i === words.length - 1}>
            <span style={{ background: "var(--brand-soft)", color: "var(--text)", border: "1.5px solid var(--line)", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 800, fontFamily: MONO, boxShadow: "1px 1px 0 var(--line)" }}>
              {w.word}
            </span>
            <span style={{ color: "var(--text-subtle)", fontSize: 12, fontFamily: MONO }}>{formatDate(w.createdAt)}</span>
            <span style={{ marginLeft: "auto" }}>
              <NativeConfirmForm action={removeSensitiveWordAction} message={`移除敏感词「${w.word}」？\n• 移除后含该词的内容将不再被拦/待审\n• 确定移除？`}>
                <input type="hidden" name="id" value={w.id} />
                <button type="submit" style={paperDangerBtn}>移除</button>
              </NativeConfirmForm>
            </span>
          </Row>
        ))}
        {words.length === 0 && (
          <PaperEmpty badge="0 条" title="暂无自定义敏感词" description="此时自动回退内置默认词表；添加词条后立即生效。" />
        )}
      </ListCard>
    </div>
  );
}
