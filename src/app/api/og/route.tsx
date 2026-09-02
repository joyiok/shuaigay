import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") ?? "SHUAI GAY 论坛").slice(0, 80);
  const board = (searchParams.get("board") ?? "综合讨论").slice(0, 20);
  const author = (searchParams.get("author") ?? "").slice(0, 20);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: "#FFFBF2",
          border: "8px solid #111114",
          padding: "48px",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* 纸纹 */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(17,17,20,0.06) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            opacity: 0.5,
          }}
        />
        {/* 胶带 */}
        <div
          style={{
            position: "absolute",
            top: -14,
            left: 48,
            width: 96,
            height: 20,
            background: "#FFF7A8",
            border: "1px solid rgba(17,17,20,0.12)",
            transform: "rotate(-1.2deg)",
          }}
        />
        {/* 顶部 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, zIndex: 1 }}>
          <div
            style={{
              width: 40,
              height: 40,
              background: "#111114",
              color: "#FFFBF2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 16,
              border: "2px solid #111114",
              transform: "rotate(-2deg)",
            }}
          >
            SG
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", color: "#111114" }}>SHUAI GAY</span>
          <span
            style={{
              marginLeft: 8,
              fontSize: 12,
              fontFamily: "monospace",
              background: "#FFF7A8",
              border: "1.5px solid #111114",
              padding: "2px 8px",
              borderRadius: 999,
            }}
          >
            / {board}
          </span>
        </div>

        {/* 标题 */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            zIndex: 1,
            marginTop: 20,
          }}
        >
          <div
            style={{
              fontFamily: '"Crimson Pro", serif',
              fontSize: title.length > 40 ? 44 : 56,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              color: "#111114",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              overflow: "hidden",
            }}
          >
            {title}
          </div>
          {author ? (
            <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10, fontSize: 18, color: "#3F3F46" }}>
              <span style={{ width: 32, height: 32, borderRadius: 999, background: "#FFF7D6", border: "1.5px solid #111114", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{author.slice(0, 1).toUpperCase()}</span>
              <span>{author}</span>
              <span style={{ color: "#8A8A95" }}>·</span>
              <span style={{ fontFamily: "monospace", fontSize: 14, color: "#8A8A95" }}>shuaigay · 纸现场</span>
            </div>
          ) : null}
        </div>

        {/* 底部 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1, borderTop: "2px solid #111114", paddingTop: 16, marginTop: 20 }}>
          <span style={{ fontFamily: "monospace", fontSize: 12, color: "#8A8A95", letterSpacing: "0.08em" }}>FORUM.SHUAIGAY · 纸现场</span>
          <span style={{ fontSize: 12, fontWeight: 700, background: "#111114", color: "#FFFBF2", padding: "6px 12px", borderRadius: 999 }}>进来坐坐，有话直说</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
