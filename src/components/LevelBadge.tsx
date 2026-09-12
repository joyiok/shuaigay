import { getLadder, levelForPoints, nextLevelForPoints } from "@/lib/levels";

/** 等级徽章（服务端组件；不传 ladder 时读后台配置，60s 缓存） */
export default async function LevelBadge({
  points,
  role,
  ladder,
}: {
  points: number;
  role?: string | null;
  ladder?: readonly number[];
}) {
  if (role === "ADMIN") {
    return (
      <span
        style={{
          background: "var(--inverse)",
          color: "var(--inverse-text)",
          fontSize: 10,
          padding: "2px 7px",
          borderRadius: 999,
          whiteSpace: "nowrap",
          fontWeight: 700,
          border: "1px solid var(--line)",
          display: "inline-flex",
        }}
      >
        管理员
      </span>
    );
  }
  const l = ladder ?? (await getLadder().catch(() => undefined));
  const lv = levelForPoints(points, l);
  const next = nextLevelForPoints(points, l);
  const title = next ? `积分 ${points} · 距「${next.name}」还差 ${next.missing} 分` : `积分 ${points}`;
  return (
    <span
      title={title}
      style={{
        background: lv.bg,
        color: lv.color,
        border: `1px solid var(--line)`,
        fontSize: 10,
        padding: "2px 7px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        fontWeight: 700,
        display: "inline-flex",
      }}
    >
      {lv.name}
    </span>
  );
}
