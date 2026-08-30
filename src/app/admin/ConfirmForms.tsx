"use client";

import { useRef, useState } from "react";

type ConfirmFormProps = {
  action: (formData: FormData) => void;
  message: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export function ConfirmForm({ action, message, children, style }: ConfirmFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // 拦截原生提交，先弹二次确认
    e.preventDefault();
    setDialogOpen(true);
  };

  const confirm = () => {
    setDialogOpen(false);
    setPending(true);
    // 触发 server action：用 requestSubmit 保持 FormData 完整
    formRef.current?.requestSubmit();
  };

  return (
    <>
      <form ref={formRef} action={action} onSubmit={onSubmit} style={style}>
        {children}
      </form>
      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="二次确认"
          onClick={() => setDialogOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 18,
              width: "min(420px, 90vw)",
              boxShadow: "0 12px 32px var(--shadow-md)",
              display: "grid",
              gap: 14,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>请二次确认</div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
              {message}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                style={{
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 6,
                  border: "1px solid var(--line)",
                  background: "var(--panel)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirm}
                style={{
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 6,
                  border: "1px solid var(--danger)",
                  background: "var(--danger)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                确认执行
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 兜底：JS 禁用时降级为原生 confirm */}
      <noscript>
        <style>{`form[noscript-confirm] button{}`}</style>
      </noscript>
    </>
  );
}

/** 轻量版：仅用原生 confirm，不弹 dialog（用于低风险或紧凑行） */
export function NativeConfirmForm({
  action,
  message,
  children,
  style,
}: ConfirmFormProps) {
  const onSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    if (!window.confirm(message)) e.preventDefault();
  };
  return (
    <form action={action} onSubmit={onSubmit} style={style}>
      {children}
    </form>
  );
}
