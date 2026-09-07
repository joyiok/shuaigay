"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { threadHref } from "@/lib/slug";

interface SuggestItem {
  id: string;
  title: string;
}

const HISTORY_KEY = "sg_search_history";
const MAX_HISTORY = 5;

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string").slice(0, MAX_HISTORY);
    return [];
  } catch {
    return [];
  }
}

function saveHistory(term: string): string[] {
  const t = term.trim().slice(0, 100);
  if (!t) return loadHistory();
  try {
    const cur = loadHistory();
    const filtered = cur.filter((x) => x !== t);
    filtered.unshift(t);
    const next = filtered.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export default function SearchAutocomplete({
  placeholder = "搜索关键词",
  initialValue = "",
  variant = "header",
  standalone = true,
}: {
  placeholder?: string;
  initialValue?: string;
  variant?: "header" | "inline";
  /** standalone=true 时组件自带 form 与跳转；false 时仅渲染 input+下拉，适用于已被外层 form 包裹的场景（如 /search 页） */
  standalone?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // history 只在客户端加载
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => setQ(initialValue), [initialValue]);

  // 点击外部关闭
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // 150ms 防抖调 /api/search/suggest
  useEffect(() => {
    const trimmed = q.trim();
    setSuggestions([]);
    setActiveIndex(-1);
    setFailed(false);
    setLoading(Boolean(trimmed));
    if (!trimmed) {
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(trimmed)}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("bad");
        const data = (await res.json()) as { suggestions: SuggestItem[] };
        if (!ac.signal.aborted) setSuggestions(Array.isArray(data.suggestions) ? data.suggestions.slice(0, 5) : []);
      } catch {
        if (!ac.signal.aborted) setFailed(true);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 150);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [q]);

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const term = q.trim();
    if (!term) {
      inputRef.current?.focus();
      return;
    }
    const next = saveHistory(term);
    setHistory(next);
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  function handleHistoryClick(term: string) {
    setQ(term);
    const next = saveHistory(term);
    setHistory(next);
    if (standalone) {
      setOpen(false);
      router.push(`/search?q=${encodeURIComponent(term)}`);
    } else {
      // 非 standalone：仅一键填入，不自动跳转，聚焦输入框便于二次编辑或按回车搜索
      setOpen(true);
      inputRef.current?.focus();
    }
  }

  function handleSuggestClick(item: SuggestItem) {
    const next = saveHistory(item.title);
    setHistory(next);
    setOpen(false);
    router.push(threadHref(item.id, item.title));
  }

  function clearHistory() {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {}
    setHistory([]);
  }

  function removeOne(term: string) {
    try {
      const cur = loadHistory().filter((x) => x !== term);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(cur));
      setHistory(cur);
    } catch {}
  }

  const showDropdown = open && (Boolean(q.trim()) || history.length > 0);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      const next = event.key === "ArrowDown"
        ? (activeIndex + 1) % suggestions.length
        : (activeIndex <= 0 ? suggestions.length : activeIndex) - 1;
      setActiveIndex(next);
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && showDropdown && suggestions[activeIndex]) {
      event.preventDefault();
      handleSuggestClick(suggestions[activeIndex]);
    }
  }

  const comboboxProps = {
    role: "combobox",
    "aria-autocomplete": "list" as const,
    "aria-expanded": showDropdown,
    "aria-controls": showDropdown ? listId : undefined,
    "aria-activedescendant": showDropdown && suggestions[activeIndex] ? `${listId}-${activeIndex}` : undefined,
    onKeyDown: handleKeyDown,
  };

  // 外层 form 监听：非 standalone 时，父表单提交前把当前词写入历史（保证手动回车/点击搜索按钮也能留痕）
  useEffect(() => {
    if (standalone) return;
    const form = wrapRef.current?.closest("form");
    if (!form) return;
    const onSubmit = () => {
      const v = inputRef.current?.value.trim();
      if (v) {
        const nxt = saveHistory(v);
        setHistory(nxt);
      }
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [standalone]);

  // header 变体在移动端隐藏，inline 变体始终显示
  const wrapDisplayStyle: React.CSSProperties =
    variant === "header"
      ? { position: "relative", width: 240, marginLeft: "auto" }
      : { position: "relative", flex: 1, minWidth: 0 };

  return (
    <div
      ref={wrapRef}
      className={variant === "header" ? "search-ac-wrap" : "search-ac-wrap-inline"}
      style={wrapDisplayStyle}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          inputRef.current?.focus();
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      {variant === "header" && (
        <style>{`@media (max-width: 959px){.search-ac-wrap{display:none !important;}} @media (min-width:960px){.search-ac-wrap{display:block !important;}}`}</style>
      )}

      {standalone ? (
        <form
          onSubmit={handleSubmit}
          role="search"
          aria-label="搜索"
          style={{
            display: "flex",
            alignItems: "center",
            width: variant === "header" ? "100%" : undefined,
            height: 36,
            border: "1px solid var(--line)",
            borderRadius: 999,
            background: "var(--panel)",
            overflow: "hidden",
            transition: "all 0.15s ease",
          }}
        >
          <input
            {...comboboxProps}
            ref={inputRef}
            type="search"
            name="q"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setHistory(loadHistory());
              setOpen(true);
            }}
            placeholder={placeholder}
            aria-label="搜索关键词"
            autoComplete="off"
            style={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              border: "none",
              background: "transparent",
              padding: "0 16px",
              fontSize: 13,
              color: "var(--text)",
              outline: "none",
            }}
          />
          <button
            type="submit"
            aria-label="提交搜索"
            title="搜索"
            style={{
              width: 36,
              height: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-subtle)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </form>
      ) : (
        <input
          {...comboboxProps}
          ref={inputRef}
          type="search"
          name="q"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setHistory(loadHistory());
            setOpen(true);
          }}
          placeholder={placeholder}
          aria-label="搜索关键词"
          autoComplete="off"
          style={{
            width: "100%",
            height: 36,
            padding: "0 12px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            fontSize: 16,
            outline: "none",
            background: "var(--panel)",
            color: "var(--text)",
          }}
        />
      )}

      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "var(--shadow-md)",
            overflow: "hidden",
            zIndex: 50,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {/* 联想结果 */}
          <div id={listId} role="listbox" aria-label="搜索联想" aria-busy={loading}>
          {suggestions.length > 0 && (
            <div style={{ padding: "8px 0" }}>
              <div
                style={{
                  padding: "4px 12px 6px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>联想</span>
                {loading && <span style={{ fontWeight: 400, textTransform: "none" }}>加载中…</span>}
              </div>
              <ul role="presentation" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {suggestions.map((s, index) => (
                  <li key={s.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      id={`${listId}-${index}`}
                      aria-selected={activeIndex === index}
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSuggestClick(s)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "8px 12px",
                        border: "none",
                        background: activeIndex === index ? "var(--brand-soft)" : "transparent",
                        textAlign: "left",
                        fontSize: 13,
                        color: "var(--text)",
                        cursor: "pointer",
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <span style={{ color: "var(--text-subtle)", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                          <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.title}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-subtle)", flexShrink: 0 }}>→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          </div>

          {/* 无联想时的空态提示（有输入但无结果） */}
          {q.trim() && suggestions.length === 0 && (
            <div role="status" style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-subtle)" }}>
              {loading ? "正在查找主题…" : failed ? "联想暂时不可用，按回车搜索" : "无匹配主题，按回车搜索全文"}
            </div>
          )}

          {/* 历史记录 */}
          {history.length > 0 && (
            <div
              style={{
                padding: "8px 0",
                borderTop: suggestions.length > 0 ? "1px solid var(--line-soft)" : "none",
              }}
            >
              <div
                style={{
                  padding: "4px 12px 6px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>最近搜索</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={clearHistory}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--text-subtle)",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: 6,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-subtle)")}
                >
                  清除
                </button>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {history.map((h) => (
                  <li key={h} style={{ display: "flex", alignItems: "center" }}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleHistoryClick(h)}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 12px",
                        border: "none",
                        background: "transparent",
                        textAlign: "left",
                        fontSize: 13,
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        minWidth: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-soft)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ color: "var(--text-subtle)", flexShrink: 0 }}>🕘</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`删除历史 ${h}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => removeOne(h)}
                      style={{
                        width: 28,
                        height: 28,
                        marginRight: 6,
                        border: "none",
                        background: "transparent",
                        color: "var(--text-subtle)",
                        cursor: "pointer",
                        borderRadius: 6,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--danger-soft)";
                        e.currentTarget.style.color = "var(--danger)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--text-subtle)";
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 快捷提示 */}
          <div
            style={{
              padding: "6px 12px",
              fontSize: 11,
              color: "var(--text-subtle)",
              borderTop: "1px solid var(--line-soft)",
              background: "var(--bg-soft)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>↑↓ 选择 · ↵ 确认</span>
            <Link
              href="/search"
              style={{ marginLeft: "auto", color: "var(--brand)", fontWeight: 600, whiteSpace: "nowrap" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen(false)}
            >
              高级搜索
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
