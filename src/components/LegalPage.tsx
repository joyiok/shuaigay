import Link from "next/link";

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="legal-page">
      <div className="breadcrumb"><Link href="/">首页</Link><span>/</span><span>{title}</span></div>
      <header>
        <h1>{title}</h1>
        <p>最后更新：{updated}</p>
      </header>
      <div className="legal-copy">{children}</div>
    </article>
  );
}
