import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createThreadAction } from "@/app/actions/threads";

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
import Turnstile from "@/components/Turnstile";
import Link from "next/link";
import AuthRequired from "@/components/AuthRequired";

const ERRORS: Record<string, string> = {
  invalid: "标题或内容格式不对",
  file_too_large: "有附件超过大小限制",
  unsupported_type: "不支持的附件类型",
  too_many_files: `最多 ${MAX_FILES_PER_POST} 个附件`,
  captcha_failed: "人机验证未通过，请重新验证后重试",
  sensitive: "内容包含敏感词，请修改后重试",
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
        <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>在「{board.name}」发新帖</h1>
        {error && ERRORS[error] && (
          <p style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
            {ERRORS[error]}
          </p>
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
        />
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
