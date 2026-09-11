/** 登录/注册共用的品牌卡片头：logo + 标题 + 副标题 */
export default function AuthCardHeader({
  logoUrl,
  brandMark,
  title,
  subtitle,
}: {
  logoUrl?: string | null;
  brandMark: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      {logoUrl ? <img src={logoUrl} alt="" className="brand-logo" /> : <span className="brand-mark">{brandMark}</span>}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.5 }}>{title}</h1>
        <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "2px 0 0" }}>{subtitle}</p>
      </div>
    </div>
  );
}
