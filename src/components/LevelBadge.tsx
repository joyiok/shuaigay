import { getLadder, levelForPoints, nextLevelForPoints } from "@/lib/levels";

/**
 * 等级徽章（服务端组件；不传 ladder 时读后台配置，60s 缓存）。
 * 经典论坛风：纯文字彩色组名，无胶囊底。
 */
export default async function LevelBadge({
  points,
  role,
  ladder,
  customTitle,
}: {
  points: number;
  role?: string | null;
  ladder?: readonly number[];
  customTitle?: string | null;
}) {
  if (role === "ADMIN") {
    return (
      <span style={{ color: "#cc0000", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
        管理员{customTitle ? ` · ${customTitle}` : ""}
      </span>
    );
  }
  const l = ladder ?? (await getLadder().catch(() => undefined));
  const lv = levelForPoints(points, l);
  const next = nextLevelForPoints(points, l);
  const title = next ? `积分 ${points} · 距「${next.name}」还差 ${next.missing} 分` : `积分 ${points}`;
  if (customTitle) {
    return (
      <span title={`${title} · 自设头衔`} style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
        <span style={{ color: lv.color, fontSize: 11, fontWeight: 700 }}>{customTitle}</span>
        <span style={{ color: "var(--text-subtle)", fontSize: 10 }}>· {lv.name}</span>
      </span>
    );
  }
  return (
    <span title={title} style={{ color: lv.color, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
      {lv.name}
    </span>
  );
}
