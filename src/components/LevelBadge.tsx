import { levelForPoints, nextLevelForPoints } from "@/lib/levels";

export default function LevelBadge({ points, role }: { points: number; role?: string | null }) {
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
          border: "2px solid var(--line)",
          boxShadow: "2px 2px 0 var(--line)",
          transform: "rotate(-0.8deg)",
          display: "inline-flex",
        }}
      >
        管理员
      </span>
    );
  }
  const lv = levelForPoints(points);
  const next = nextLevelForPoints(points);
  const title = next ? `积分 ${points} · 距「${next.name}」还差 ${next.missing} 分` : `积分 ${points}`;
  return (
    <span
      title={title}
      style={{
        background: lv.bg,
        color: lv.color,
        border: `2px solid var(--line)`,
        fontSize: 10,
        padding: "2px 7px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        fontWeight: 700,
        boxShadow: "2px 2px 0 var(--line)",
        transform: "rotate(-0.8deg)",
        display: "inline-flex",
      }}
    >
      {lv.name}
    </span>
  );
}
