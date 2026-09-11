"use client";

import { useRef, useState } from "react";

type ReasonField = {
  name: string;
  label: string;
  placeholder?: string;
  /** 常用原因，点一下就填进输入框 */
  presets?: string[];
};

type ConfirmFormProps = {
  action: (formData: FormData) => void;
  message: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** 需要填写理由时传入（如删除/驳回内容，理由会随通知发给作者） */
  reasonField?: ReasonField;
};

const DEFAULT_PRESETS = ["广告 / 引流", "人身攻击", "涉政敏感", "侵权内容", "刷屏灌水"];

export function ConfirmForm({ action, message, children, style, reasonField }: ConfirmFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  // 已确认一次的提交要放行：requestSubmit 会再次触发 onSubmit，不标记就会又被拦下
  const confirmedRef = useRef(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (confirmedRef.current) return; // 放行给 server action
    // 拦截原生提交，先弹二次确认
    e.preventDefault();
    setDialogOpen(true);
  };

  const confirm = () => {
    confirmedRef.current = true;
    setDialogOpen(false);
    setPending(true);
    // 触发 server action：用 requestSubmit 保持 FormData 完整
    formRef.current?.requestSubmit();
  };

  return (
    <>
      <form ref={formRef} action={action} onSubmit={onSubmit} style={style}>
        {children}
        {reasonField ? <input type="hidden" name={reasonField.name} value={reason} readOnly /> : null}
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
            {reasonField ? (
              <div style={{ display: "grid", gap: 8 }}>
                <label htmlFor="confirm-reason" style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                  {reasonField.label}
                  <span style={{ fontWeight: 400, color: "var(--text-subtle)" }}>（作者会收到这条说明）</span>
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(reasonField.presets ?? DEFAULT_PRESETS).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReason(preset)}
                      style={{
                        fontSize: 11.5,
                        padding: "3px 9px",
                        borderRadius: 999,
                        border: `1px solid ${reason === preset ? "var(--brand)" : "var(--line)"}`,
                        background: reason === preset ? "var(--brand-soft)" : "var(--panel)",
                        color: reason === preset ? "var(--brand)" : "var(--text-muted)",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <textarea
                  id="confirm-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 200))}
                  rows={2}
                  placeholder={reasonField.placeholder ?? "可留空，留空时按「违反社区规范」告知作者"}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    background: "var(--bg-soft)",
                    fontSize: 13,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            ) : null}
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
                disabled={pending}
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
