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

export default function UserAvatar({ username, avatarUrl, size = 38, fontSize = 13, radius = 10, className, style }: Props) {
  const url = avatarUrlForStoredName(avatarUrl ?? null);
  const letter = username.slice(0, 1).toUpperCase();
  if (url) {
    return (
      <span
        className={className ?? "post-avatar"}
        style={{
          width: size,
          height: size,
          borderRadius: typeof radius === "number" ? radius : undefined,
          overflow: "hidden",
          background: "var(--brand-soft)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          ...(typeof radius === "string" ? { borderRadius: radius } : {}),
          ...style,
        }}
        aria-label={`${username} 头像`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
        borderRadius: typeof radius === "number" ? radius : undefined,
        ...(typeof radius === "string" ? { borderRadius: radius } : {}),
        ...style,
      }}
    >
      {letter}
    </span>
  );
}
