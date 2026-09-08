"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/**
 * 关注 / 收藏这类「切换态」按钮。
 *
 * 为什么不用 `<form action={serverAction}>`：server action 里 redirect 回当前 URL 时，
 * Next 的客户端路由缓存不会刷新，按钮态会停在旧值。
 * 这里在客户端 await action，用 action 返回的权威新状态做乐观更新（立即反馈），
 * 再 `router.refresh()` 同步服务端渲染的计数等周边信息（refresh 偶发不落地也不影响按钮）。
 * 未登录时 action 内仍会 redirect("/login")，由 Next 处理跳转。
 */
export default function ActionToggle({
  action,
  fields,
  active,
  label,
  activeLabel,
  pendingLabel,
  title,
  style,
  activeStyle,
  className,
}: {
  /** 返回布尔值表示切换后的状态（true=已关注/已收藏） */
  action: (data: FormData) => Promise<boolean | void>;
  /** 随表单提交的隐藏字段 */
  fields: Record<string, string>;
  active: boolean;
  label: ReactNode;
  activeLabel: ReactNode;
  pendingLabel?: ReactNode;
  title?: string;
  style?: CSSProperties;
  activeStyle?: CSSProperties;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  // 服务端状态变化后清掉乐观值，避免长期压过服务端真值
  useEffect(() => setOptimistic(null), [active]);
  const isActive = optimistic ?? active;

  return (
    <form
      style={{ display: "contents" }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        try {
          const result = await action(new FormData(event.currentTarget));
          if (typeof result === "boolean") setOptimistic(result);
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        disabled={pending}
        aria-pressed={isActive}
        aria-busy={pending}
        title={title}
        className={className}
        style={{ ...style, ...(isActive ? activeStyle : {}), ...(pending ? { opacity: 0.72, cursor: "progress" } : {}) }}
      >
        {pending ? (pendingLabel ?? (isActive ? activeLabel : label)) : isActive ? activeLabel : label}
      </button>
    </form>
  );
}
