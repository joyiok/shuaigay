import Link from "next/link";

type EmptyVariant = "default" | "search" | "thread" | "post" | "user" | "invite" | "report" | "board";

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  variant?: EmptyVariant;
}

const TITLES: Record<EmptyVariant, string> = {
  default: "这里空空如也",
  search: "没有找到相关内容",
  thread: "还没有帖子",
  post: "还没有回复",
  user: "还没有内容",
  invite: "还没有邀请码",
  report: "暂无待处理",
  board: "暂无版块",
};

const DESCS: Record<EmptyVariant, string> = {
  default: "暂时没有内容，去别处逛逛吧。",
  search: "换个关键词试试，或减少筛选条件。",
  thread: "还没有帖子，来发第一帖吧。",
  post: "还没有回复，快来抢沙发。",
  user: "这个用户还没有发布任何内容。",
  invite: "还没有邀请码，点“生成新码”开始邀请。",
  report: "队列已清空，没有待处理的举报。",
  board: "管理员还没有创建任何版块。",
};

function Illustration({ variant }: { variant: EmptyVariant }) {
  // 手绘感线框涂鸦: 墨色描边 + 纸面填充, 外层用 .empty-doodle 微转托底
  const common = {
    stroke: "currentColor",
    strokeWidth: 1.8,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (variant === "search") {
    return (
      <svg width="96" height="72" viewBox="0 0 96 72" fill="none" aria-hidden="true" style={{ color: "var(--text)", opacity: 0.9 }}>
        <rect x="12" y="10" width="72" height="48" rx="10" stroke="currentColor" strokeWidth={1.8} fill="var(--bg-soft)" />
        <circle cx="42" cy="34" r="14" {...common} />
        <path d="M52 44L64 56" {...common} />
        <circle cx="42" cy="34" r="4" fill="currentColor" opacity={0.08} stroke="none" />
      </svg>
    );
  }
  if (variant === "board") {
    return (
      <svg width="96" height="72" viewBox="0 0 96 72" fill="none" aria-hidden="true" style={{ color: "var(--text)", opacity: 0.9 }}>
        <rect x="14" y="16" width="68" height="44" rx="10" stroke="currentColor" strokeWidth={1.8} fill="var(--bg-soft)" />
        <path d="M26 30H70M26 40H70M26 50H52" {...common} />
        <rect x="22" y="22" width="52" height="6" rx="3" fill="currentColor" opacity={0.06} stroke="none" />
      </svg>
    );
  }
  if (variant === "invite") {
    return (
      <svg width="96" height="72" viewBox="0 0 96 72" fill="none" aria-hidden="true" style={{ color: "var(--text)", opacity: 0.9 }}>
        <rect x="18" y="14" width="60" height="44" rx="12" stroke="currentColor" strokeWidth={1.8} fill="var(--bg-soft)" />
        <path d="M30 36H66M30 44H54" {...common} />
        <circle cx="48" cy="28" r="8" stroke="currentColor" strokeWidth={1.8} fill="none" />
        <path d="M44 28L47 31L52 25" {...common} />
      </svg>
    );
  }
  if (variant === "report") {
    return (
      <svg width="96" height="72" viewBox="0 0 96 72" fill="none" aria-hidden="true" style={{ color: "var(--text)", opacity: 0.9 }}>
        <path d="M48 12L78 24V48L48 60L18 48V24L48 12Z" stroke="currentColor" strokeWidth={1.8} fill="var(--bg-soft)" />
        <path d="M48 28V38M48 44H48.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    );
  }
  // default / thread / post / user
  return (
    <svg width="96" height="72" viewBox="0 0 96 72" fill="none" aria-hidden="true" style={{ color: "var(--text)", opacity: 0.9 }}>
      <rect x="16" y="12" width="64" height="48" rx="12" stroke="currentColor" strokeWidth={1.8} fill="var(--bg-soft)" />
      <rect x="26" y="24" width="44" height="6" rx="3" fill="currentColor" opacity={0.08} />
      <rect x="26" y="34" width="32" height="6" rx="3" fill="currentColor" opacity={0.06} />
      <circle cx="48" cy="50" r="2" fill="currentColor" opacity={0.2} />
    </svg>
  );
}

export default function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  variant = "default",
}: EmptyStateProps) {
  const t = title ?? TITLES[variant] ?? TITLES.default;
  const d = description ?? DESCS[variant] ?? DESCS.default;

  return (
    <div
      className="empty-paper"
      style={{ display: "grid", gap: 14, justifyItems: "center" }}
      role="status"
      aria-live="polite"
    >
      <div className="empty-doodle" style={{ width: 104, height: 78 }}>
        <Illustration variant={variant} />
      </div>
      <div style={{ display: "grid", gap: 6, justifyItems: "center", maxWidth: 420 }}>
        <p className="empty-title" style={{ margin: 0 }}>{t}</p>
        <p style={{ margin: 0, color: "var(--text-subtle)", fontSize: 13, lineHeight: 1.6 }}>{d}</p>
      </div>
      {(actionLabel && (actionHref || onAction)) && (
        <div style={{ marginTop: 4 }}>
          {actionHref ? (
            <Link
              href={actionHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 36,
                padding: "0 18px",
                background: "var(--brand)",
                color: "#fff",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                border: "2px solid var(--line)",
                boxShadow: "3px 3px 0 var(--line)",
                textDecoration: "none",
              }}
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onAction}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 36,
                padding: "0 18px",
                background: "var(--brand)",
                color: "#fff",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                border: "2px solid var(--line)",
                boxShadow: "3px 3px 0 var(--line)",
                cursor: "pointer",
              }}
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
