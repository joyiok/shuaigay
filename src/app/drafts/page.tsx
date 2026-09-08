import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import AuthRequired from "@/components/AuthRequired";
import DraftsList from "@/components/DraftsList";

export const metadata: Metadata = {
  title: "草稿箱",
  description: "本机保存的发帖、回复与私信草稿。",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const me = await getCurrentUser();
  if (!me) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="breadcrumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>草稿箱</span>
        </div>
        <h1 className="page-heading">草稿箱</h1>
        <AuthRequired title="登录后查看草稿" description="草稿按账号隔离保存在本机浏览器里，登录后即可查看与继续编辑。" next="/drafts" />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>草稿箱</span>
      </div>
      <div className="card" style={{ padding: 14 }}>
        <h1 className="page-heading">草稿箱</h1>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--text-subtle)", lineHeight: 1.7 }}>
          发帖、回帖、私信没提交的内容会自动存到这台设备，这里可以继续写或删除。
        </p>
      </div>
      <DraftsList userId={me.id} />
    </div>
  );
}
