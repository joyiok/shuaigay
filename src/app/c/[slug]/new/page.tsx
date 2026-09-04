import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createThreadAction } from "@/app/actions/threads";
import { isAdmin } from "@/lib/permissions";
import { isBoardModerator } from "@/lib/moderators";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const board = await db.board.findUnique({ where: { slug } }).catch(() => null);
  if (!board) return { title: "版块不存在" };
  return {
    title: `在「${board.name}」发新帖`,
    description: `在 ${board.name} 版块发布新主题 — SHUAI GAY 论坛。`,
    robots: { index: false, follow: false },
  };
}
import { MAX_FILES_PER_POST, maxUploadBytes } from "@/lib/storage";
import Composer from "@/components/Composer";
import TitleDraft from "@/components/TitleDraft";
import { draftKey } from "@/lib/draft";
import Turnstile from "@/components/Turnstile";
import Link from "next/link";
import AuthRequired from "@/components/AuthRequired";
import HumanizedFeedback from "@/components/HumanizedFeedback";

const ERRORS: Record<string, { title: string; msg: string; tip: string }> = {
  invalid: { title: "少写了点", msg: "标题 5-120 字，正文 1-20000 字。", tip: "标题再补几个字，正文别空着" },
  invalid_category: { title: "分类找不到了", msg: "选的分类不存在，可能刚被删。", tip: "刷新一下重选" },
  board_locked: { title: "版块锁了", msg: "这个版块已锁定，普通用户不能发新帖。", tip: "去别的版发，或找版主开锁" },
  file_too_large: { title: "附件太大了", msg: "新手 5MB，正式及以上 20MB。", tip: "升级后再传，或压一下图" },
  unsupported_type: { title: "格式不支持", msg: "只认 JPG/PNG/GIF/WEBP 等常见图。", tip: "换个格式再试" },
  too_many_files: { title: "附件太多了", msg: `最多 ${MAX_FILES_PER_POST} 个。`, tip: "分两次发，或删几个" },
  captcha_failed: { title: "人机验证没过", msg: "请重新点一下验证。", tip: "有时网慢，多试一次" },
  sensitive: { title: "有敏感词", msg: "内容里有敏感词，已转待审而不是直接拦。", tip: "等版主过审，或改一下措辞" },
  daily_limit: { title: "今天发够了", msg: "今日发帖已达上限。", tip: "新手 3/日 正式 5/日，明天再来或升个级" },
};

export default async function NewThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const user = await getCurrentUser();
  const board = await db.board.findUnique({ where: { slug } });
  if (!board) notFound();
  const categories = await db.threadCategory.findMany({ where: { boardId: board.id }, orderBy: { order: "asc" } });
  const _isStaffNew = isAdmin(user) || (user ? await isBoardModerator(user.id, board.id) : false);
  if ((board as unknown as { isHidden: boolean }).isHidden && !_isStaffNew) notFound();
  if ((board as unknown as { isLocked: boolean }).isLocked && !_isStaffNew && user) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="breadcrumb"><Link href="/">首页</Link><span>/</span><Link href={`/c/${board.slug}`}>{board.name}</Link><span>/</span><span style={{ color: "var(--text)", fontWeight: 600 }}>发新帖</span></div>
        <div className="card" style={{ padding: 16 }}><p style={{ color: "var(--text-muted)", fontSize: 13 }}>版块已锁定，无法发帖。仅版主/管理员可发。</p><Link href={`/c/${board.slug}`} style={{ display: "inline-flex", marginTop: 10, height: 32, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--panel)", fontSize: 13 }}>返回版块</Link></div>
      </div>
    );
  }
  if (!user) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="breadcrumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <Link href={`/c/${board.slug}`}>{board.name}</Link>
          <span>/</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>发新帖</span>
        </div>
        <AuthRequired title="请先登录后发帖" description="登录后才能在版块发布新主题，支持 Markdown、@提及与附件。" next={`/c/${slug}/new`} />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <Link href={`/c/${board.slug}`}>{board.name}</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>发新帖</span>
      </div>
      <form action={createThreadAction} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <input type="hidden" name="boardSlug" value={board.slug} />
        <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0, fontFamily: "Crimson Pro, serif" }}>在「{board.name}」发新帖</h1>
        {error && ERRORS[error] && (
          <HumanizedFeedback type="error" title={ERRORS[error].title} message={ERRORS[error].msg} suggestion={ERRORS[error].tip} />
        )}
        {categories.length > 0 && (
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>分类（可选）</span>
            <select name="categoryId" defaultValue="" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 14, outline: "none", background: "var(--panel)" }}>
              <option value="">不分类</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>标题（5-120 字）</span>
          <input
            name="title"
            required
            maxLength={120}
            minLength={5}
            placeholder="一句话概括你的主题"
            aria-label="标题"
            autoComplete="off"
            style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 14, outline: "none" }}
          />
        </label>
        <Composer
          placeholder="正文，支持 Markdown（@提及 / 粘贴图片 / 表情）"
          rows={10}
          monospace
          maxFiles={MAX_FILES_PER_POST}
          maxBytes={maxUploadBytes()}
          draftKey={draftKey("new", board.slug)}
        />
        <TitleDraft storageKey={draftKey("newtitle", board.slug)} />
        <Turnstile resetSignal={error} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            style={{ background: "var(--brand)", color: "#fff", borderRadius: 6, height: 36, padding: "0 18px", fontSize: 14, fontWeight: 600, border: "1px solid var(--brand)" }}
          >
            发布
          </button>
          <Link
            href={`/c/${board.slug}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 36,
              padding: "0 14px",
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--panel)",
              fontSize: 13,
            }}
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
