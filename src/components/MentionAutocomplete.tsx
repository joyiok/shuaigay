"use client";

import { useEffect, useRef, useState } from "react";

/** 用户名允许的字符(与注册校验一致) */
const USERNAME_CHARS = /^[a-zA-Z0-9_-]*$/;

interface MentionState {
  /** @ 在文本中的位置 */
  at: number;
  query: string;
  active: number;
}

interface Props {
  /** 绑定的 textarea */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * @提及自动补全:输入 @ 后 fetch /api/users/search 展示下拉,
 * 回车/Tab/点击选中后插入 "@username "。
 */
export default function MentionAutocomplete({ textareaRef }: Props) {
  const [state, setState] = useState<MentionState | null>(null);
  const [users, setUsers] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  // 监听回调里要读到最新 state,用 ref 镜像避免反复重挂监听
  const stateRef = useRef(state);
  stateRef.current = state;
  const usersRef = useRef(users);
  usersRef.current = users;

  const timerRef = useRef<number | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const queryRef = useRef("");

  /** 从光标位置向前找正在输入的 @片段 */
  function findMention(ta: HTMLTextAreaElement): { at: number; query: string } | null {
    const value = ta.value;
    const pos = ta.selectionStart;
    let end = pos;
    while (end > 0 && USERNAME_CHARS.test(value[end - 1])) end--;
    if (end === 0 || value[end - 1] !== "@") return null;
    const at = end - 1;
    // @ 前面紧跟用户名符号 = 邮箱/仓库路径之类,不算提及
    if (at > 0 && USERNAME_CHARS.test(value[at - 1])) return null;
    return { at, query: value.slice(at + 1, pos) };
  }

  async function search(q: string) {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
        signal: ctrl.signal,
      });
      if (!res.ok || ctrl.signal.aborted) return;
      const data = (await res.json()) as { users: string[] };
      // 结果只对应当前查询,过期结果丢弃
      if (queryRef.current === q) setUsers(data.users);
    } catch {
      // abort 或网络错误:静默
    }
  }

  function refresh() {
    const ta = textareaRef.current;
    if (!ta) return;
    const found = findMention(ta);
    if (!found || found.query.length < 1) {
      setState(null);
      setUsers([]);
      return;
    }
    queryRef.current = found.query;
    setState((prev) =>
      prev && prev.at === found.at
        ? { ...prev, query: found.query }
        : { at: found.at, query: found.query, active: 0 },
    );
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => search(found.query), 180);
  }

  /** 选中的用户名回填到文本 */
  function apply(username: string) {
    const ta = textareaRef.current;
    if (!ta || !stateRef.current) return;
    const found = findMention(ta);
    const at = found && found.at >= 0 ? found.at : stateRef.current.at;
    ta.setRangeText(`${username} `, at, ta.selectionStart, "end");
    ta.focus();
    setState(null);
    setUsers([]);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function onKeyDown(e: KeyboardEvent) {
    const st = stateRef.current;
    if (!st) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const len = Math.max(usersRef.current.length, 1);
      setState((prev) =>
        prev
          ? {
              ...prev,
              active: (prev.active + (e.key === "ArrowDown" ? 1 : -1) + len) % len,
            }
          : prev,
      );
    } else if (e.key === "Enter" || e.key === "Tab") {
      const target = usersRef.current[st.active];
      if (target) {
        e.preventDefault();
        apply(target);
      }
    } else if (e.key === "Escape") {
      setState(null);
      setUsers([]);
    }
  }

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const onRefresh = () => refresh();
    ta.addEventListener("input", onRefresh);
    ta.addEventListener("click", onRefresh);
    ta.addEventListener("mouseup", onRefresh);
    ta.addEventListener("keyup", onRefresh);
    ta.addEventListener("keydown", onKeyDown);
    return () => {
      ta.removeEventListener("input", onRefresh);
      ta.removeEventListener("click", onRefresh);
      ta.removeEventListener("mouseup", onRefresh);
      ta.removeEventListener("keyup", onRefresh);
      ta.removeEventListener("keydown", onKeyDown);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      ctrlRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textareaRef]);

  // 点击组件外部时收起下拉
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!stateRef.current) return;
      const t = e.target as Node | null;
      if (rootRef.current && t && !rootRef.current.contains(t)) {
        setState(null);
        setUsers([]);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  if (!state) return null;

  return (
    <div
      ref={rootRef}
      className="mention-pop"
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: 0,
        right: 0,
        zIndex: 40,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        boxShadow: "0 8px 24px var(--shadow-md)",
      }}
    >
      <div style={{ maxHeight: 220, overflowY: "auto", padding: 4 }}>
        {users.length === 0 ? (
          <div style={{ padding: "10px 12px", color: "var(--text-subtle)", fontSize: 13 }}>
            未找到匹配用户
          </div>
        ) : (
          users.map((u, i) => (
            <button
              key={u}
              type="button"
              className={`mention-item${i === state.active ? " active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                apply(u);
              }}
              onMouseEnter={() =>
                setState((prev) => (prev ? { ...prev, active: i } : prev))
              }
            >
              <span className="mention-avatar">{u.slice(0, 1).toUpperCase()}</span>
              <span>@{u}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}