"use client";

import { useRef, useState, type ComponentProps, type RefObject } from "react";
import { unstable_rethrow } from "next/navigation";

/** 只有服务端确认写入成功才重置编辑器；失败时保留内容和附件。 */
export default function SubmissionForm({ action, children, formRef, ...props }: Omit<ComponentProps<"form">, "action"> & {
  action: (data: FormData) => Promise<string>;
  formRef?: RefObject<HTMLFormElement | null>;
}) {
  const localRef = useRef<HTMLFormElement>(null);
  const ref = formRef ?? localRef;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <form {...props} ref={ref} aria-busy={pending} onSubmit={async (event) => {
      event.preventDefault();
      if (pending) return;
      setPending(true);
      setError("");
      try {
        const destination = await action(new FormData(event.currentTarget));
        if (!new URL(destination, window.location.href).searchParams.has("error")) {
          ref.current?.reset();
        }
        window.location.assign(destination);
      } catch (error) {
        unstable_rethrow(error);
        setError("提交未完成，内容已保留。请检查网络后重试。");
        setPending(false);
      }
    }}>
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
      <fieldset disabled={pending} style={{ display: "contents" }}>{children}</fieldset>
      {pending && <p role="status">正在提交，请稍候…</p>}
    </form>
  );
}
