"use client";

import { useState, type ComponentProps } from "react";
import { unstable_rethrow } from "next/navigation";

/**
 * 设置页表单：提交 server action 成功后由客户端整页跳转。
 *
 * 为什么不用 `<form action={serverAction}>` + action 内 redirect：
 * Next 15 对「POST 到当前路径、action 再 303 回同一路径但查询参数不同」的处理
 * 会把页面正文留在空 Suspense 占位（URL 变了、内容没了，实测 main 为空）。
 * 客户端显式 `window.location.assign` 走整页导航，行为确定。
 */
export default function SettingsForm({
  action,
  next,
  children,
  ...props
}: Omit<ComponentProps<"form">, "action"> & {
  action: (data: FormData) => Promise<void>;
  /** 提交成功后跳转的站内地址 */
  next: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      {...props}
      aria-busy={pending}
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        setError("");
        try {
          await action(new FormData(event.currentTarget));
          window.location.assign(next);
        } catch (err) {
          unstable_rethrow(err);
          setError("提交未完成，请检查网络后重试。");
          setPending(false);
        }
      }}
    >
      {error && (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          {error}
        </p>
      )}
      <fieldset disabled={pending} style={{ display: "contents" }}>
        {children}
      </fieldset>
      {pending && (
        <p role="status" style={{ margin: 0, fontSize: 12, color: "var(--text-subtle)" }}>
          正在保存，请稍候…
        </p>
      )}
    </form>
  );
}
