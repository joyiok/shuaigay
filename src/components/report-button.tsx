"use client";

import { useRef, useState } from "react";

type UiState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; ok: boolean; text: string; needsAuth?: boolean };

/** 帖子旁的「举报」按钮:原生 dialog 弹出简易表单,提交到 /api/reports */
export default function ReportButton({ postId }: { postId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<UiState>({ kind: "idle" });

  function openDialog() {
    setState({ kind: "idle" });
    dialogRef.current?.showModal();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
    if (reason.length < 5) {
      setState({ kind: "done", ok: false, text: "举报理由至少 5 个字" });
      return;
    }
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "post", targetId: postId, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      const needsAuth = res.status === 401;
      setState({
        kind: "done",
        ok: res.ok,
        text: res.ok ? "已提交，等待管理员审核" : needsAuth ? "请先登录后再举报" : data.error ?? "提交失败，请稍后再试",
        needsAuth,
      });
    } catch {
      setState({ kind: "done", ok: false, text: "网络异常，请稍后再试" });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        style={{ color: "var(--text-subtle)", fontSize: 12, cursor: "pointer" }}
      >
        举报
      </button>

      <dialog
        ref={dialogRef}
        className="report-dialog"
        style={{
          border: "1px solid var(--line)",
          borderRadius: 12,
          background: "var(--panel)",
          color: "var(--text)",
          width: 380,
          maxWidth: "calc(100vw - 32px)",
          padding: 0,
          boxShadow: "0 12px 32px var(--shadow-md)",
        }}
        onClick={(e) => {
          // 点遮罩关闭
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <form onSubmit={submit} style={{ display: "grid", gap: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>举报这条内容</div>

          <textarea
            name="reason"
            rows={4}
            maxLength={500}
            required
            placeholder="请简述违规原因（至少 5 个字）"
            style={{
              width: "100%",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "10px 12px",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          {state.kind === "done" && (
            <div
              style={{
                display: "grid",
                gap: 8,
                fontSize: 13,
                borderRadius: 6,
                padding: "8px 12px",
                background: state.ok ? "var(--success-soft)" : "var(--danger-soft)",
                color: state.ok ? "var(--success)" : "var(--danger)",
              }}
            >
              <p style={{ margin: 0 }}>{state.text}</p>
              {state.needsAuth && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a
                    href="/login"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 28,
                      padding: "0 12px",
                      background: "#0f172a",
                      color: "#fff",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      border: "1px solid #0f172a",
                    }}
                  >
                    去登录
                  </a>
                  <a
                    href="/register"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 28,
                      padding: "0 12px",
                      background: "#fff",
                      color: "#0f172a",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    去注册
                  </a>
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 2,
            }}
          >
            {state.kind === "done" ? (
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                style={{
                  height: 30,
                  padding: "0 14px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  background: "var(--panel)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                关闭
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => dialogRef.current?.close()}
                  style={{
                    height: 30,
                    padding: "0 14px",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    background: "var(--panel)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={state.kind === "busy"}
                  style={{
                    height: 30,
                    padding: "0 14px",
                    border: "1px solid var(--brand)",
                    borderRadius: 6,
                    background: "var(--brand)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    opacity: state.kind === "busy" ? 0.6 : 1,
                  }}
                >
                  {state.kind === "busy" ? "提交中…" : "提交举报"}
                </button>
              </>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}