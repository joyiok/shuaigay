"use client";

function avatarUrlForStoredName(storedName: string | null | undefined): string | null {
  if (!storedName) return null;
  return `/api/avatar?file=${encodeURIComponent(storedName)}`;
}

type Props = {
  username: string;
  avatarUrl?: string | null;
  size?: number;
  fontSize?: number;
  radius?: number | string;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * 统一头像：默认 40px 圆角 10，缺省首字母占位保持 slate-900 极简
 * 帖子 / 侧边 / 顶部均复用此组件，确保视觉一致
 */
export default function UserAvatar({ username, avatarUrl, size = 40, fontSize = 14, radius = 10, className, style }: Props) {
  const url = avatarUrlForStoredName(avatarUrl ?? null);
  const letter = username.slice(0, 1).toUpperCase();
  const r = typeof radius === "number" ? radius : undefined;
  const rStr = typeof radius === "string" ? radius : undefined;
  if (url) {
    return (
      <span
        className={className ?? "post-avatar"}
        style={{
          width: size,
          height: size,
          borderRadius: r,
          overflow: "hidden",
          background: "var(--brand-soft)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: "1px solid var(--line)",
          ...(rStr ? { borderRadius: rStr } : {}),
          ...style,
        }}
        aria-label={`${username} 头像`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={username} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </span>
    );
  }
  return (
    <span
      className={className ?? "post-avatar"}
      style={{
        width: size,
        height: size,
        fontSize,
        fontWeight: 700,
        borderRadius: r,
        background: "var(--bg-soft)",
        color: "var(--text-muted)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        border: "1px solid var(--line)",
        overflow: "hidden",
        ...(rStr ? { borderRadius: rStr } : {}),
        ...style,
      }}
      aria-label={`${username} 头像占位`}
    >
      {letter}
    </span>
  );
}
