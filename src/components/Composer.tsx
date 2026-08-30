"use client";

import { useEffect, useRef, useState } from "react";
import MentionAutocomplete from "./MentionAutocomplete";
import { formatBytes } from "@/lib/format";
import { renderMarkdown } from "@/lib/markdown";

const EMOJIS = ["😀", "😂", "😆", "😎", "🤔", "😍", "😭", "🔥"];

interface ComposerProps {
  placeholder?: string;
  rows?: number;
  monospace?: boolean;
  /** 最大附件数(服务端 MAX_FILES_PER_POST) */
  maxFiles?: number;
  /** 单文件大小上限(服务端 maxUploadBytes) */
  maxBytes?: number;
}

/**
 * 发帖/回帖共用编辑器:
 * - 正文 textarea(name=content)
 * - Markdown 工具栏：加粗 / 斜体 / 链接 / 代码 / 引用
 * - 预览 Tab：左侧 textarea，右侧实时渲染
 * - 粘贴图片 → 加入附件预览,随表单一起提交(隐藏 file input 同步)
 * - 多图缩略图展示 + 移除
 * - @提及自动补全
 * - 表情面板
 * - 「引用」按钮委托
 */
export default function Composer({
  placeholder,
  rows = 6,
  monospace = false,
  maxFiles = 5,
  maxBytes = 20 * 1024 * 1024,
}: ComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [text, setText] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");

  // 防抖 200ms 渲染预览
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        setPreviewHtml(renderMarkdown(text));
      } catch {
        setPreviewHtml(text);
      }
    }, 200);
    return () => clearTimeout(id);
  }, [text]);

  // 图片缩略图:objectURL 生命周期随 files 走
  useEffect(() => {
    const urls = files.map((f) =>
      f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
    );
    setPreviewUrls(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [files]);

  // 附件同步进隐藏 file input,随表单一起提交给 server action
  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
  }, [files]);

  function addFiles(incoming: File[]) {
    setFileError(null);
    const tooBig = incoming.find((f) => f.size > maxBytes);
    if (tooBig) {
      setFileError(
        `「${tooBig.name}」超过 ${Math.round(maxBytes / 1024 / 1024)}MB 限制`,
      );
      return;
    }
    const room = maxFiles - files.length;
    if (incoming.length > room) {
      setFileError(`最多 ${maxFiles} 个附件`);
      setFiles((prev) => [...prev, ...incoming.slice(0, Math.max(0, room))]);
      return;
    }
    setFiles((prev) => [...prev, ...incoming]);
  }

  /** 粘贴图片 → 加入附件(不阻止普通文本粘贴) */
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.files;
    if (!items || items.length === 0) return;
    const images = Array.from(items).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    e.preventDefault();
    addFiles(images);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // 允许重复选择同一个文件
    if (picked.length) addFiles(picked);
  }

  /** 在光标处插入文本;block 表示需要上下换行的块内容(引用) */
  function insertAtCursor(insert: string, block = false) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const needLead = block && before.length > 0 && !/\s$/.test(before);
    const needTail = block && after.length > 0 && !/^\s/.test(after);
    ta.setRangeText(
      (needLead ? "\n\n" : "") + insert + (needTail ? "\n\n" : ""),
      start,
      end,
      "end",
    );
    ta.focus();
    setText(ta.value);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** 包裹选中区：before + selected(或 placeholder) + after，并选中内部文本便于继续编辑 */
  function wrapSelection(before: string, after: string, placeholder: string) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const selected = ta.value.slice(start, end);
    const inner = selected || placeholder;
    const content = before + inner + after;
    ta.setRangeText(content, start, end, "end");
    const innerStart = start + before.length;
    const innerEnd = innerStart + inner.length;
    ta.setSelectionRange(innerStart, innerEnd);
    ta.focus();
    setText(ta.value);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function handleBold() {
    wrapSelection("**", "**", "粗体文本");
  }
  function handleItalic() {
    wrapSelection("*", "*", "斜体文本");
  }
  function handleLink() {
    wrapSelection("[", "](https://example.com)", "链接文本");
  }
  function handleCode() {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = ta.value.slice(start, end);
    if (selected.includes("\n")) {
      wrapSelection("```\n", "\n```", "代码块");
    } else {
      wrapSelection("`", "`", "代码");
    }
  }
  function handleQuote() {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = ta.value.slice(start, end);
    if (selected) {
      const quoted = selected
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      ta.setRangeText(quoted, start, end, "end");
      ta.setSelectionRange(start, start + quoted.length);
      ta.focus();
      setText(ta.value);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      insertAtCursor("> 引用文本", true);
    }
  }

  // 「引用」按钮委托:楼层上带 .post-quote-btn 的按钮点击后插入引用块
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.(".post-quote-btn") as HTMLElement | null;
      if (!btn) return;
      const author = btn.dataset.author?.trim();
      const floor = btn.dataset.floor?.trim();
      const taText = btn.dataset.text?.trim();
      if (!author || !taText) return;
      insertAtCursor(`> **@${author}** · 第 ${floor} 楼：\n> ${taText}`, true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "10px 12px",
    fontFamily: monospace ? "ui-monospace, monospace" : "inherit",
    fontSize: 13,
    outline: "none",
    lineHeight: 1.6,
    resize: "vertical",
    minHeight: 90,
  };

  const mdBtnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    border: "1px solid var(--line)",
    borderRadius: 6,
    background: "var(--panel)",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  };

  return (
    <>
      {/* 预览 Tab */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setTab("edit")}
          style={{
            height: 28,
            padding: "0 12px",
            borderRadius: 999,
            border: "1px solid var(--line)",
            background: tab === "edit" ? "var(--brand)" : "var(--panel)",
            color: tab === "edit" ? "#fff" : "var(--text-muted)",
            fontSize: 12,
            fontWeight: tab === "edit" ? 700 : 500,
            cursor: "pointer",
          }}
        >
          编辑
        </button>
        <button
          type="button"
          onClick={() => setTab("preview")}
          style={{
            height: 28,
            padding: "0 12px",
            borderRadius: 999,
            border: "1px solid var(--line)",
            background: tab === "preview" ? "var(--brand)" : "var(--panel)",
            color: tab === "preview" ? "#fff" : "var(--text-muted)",
            fontSize: 12,
            fontWeight: tab === "preview" ? 700 : 500,
            cursor: "pointer",
          }}
        >
          预览
        </button>
      </div>

      {/* Markdown 工具栏（加粗/斜体/链接/代码/引用） */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          flexWrap: "wrap",
          padding: "6px 8px",
          border: "1px solid var(--line)",
          borderRadius: 8,
          background: "var(--bg)",
        }}
        aria-label="Markdown 工具栏"
      >
        <button type="button" onClick={handleBold} style={mdBtnStyle} title="加粗 (选中文字后点击)" aria-label="加粗">
          <span style={{ fontWeight: 900 }}>B</span>
        </button>
        <button type="button" onClick={handleItalic} style={mdBtnStyle} title="斜体" aria-label="斜体">
          <span style={{ fontStyle: "italic", fontWeight: 700 }}>I</span>
        </button>
        <button type="button" onClick={handleLink} style={mdBtnStyle} title="链接" aria-label="链接">
          🔗
        </button>
        <button type="button" onClick={handleCode} style={mdBtnStyle} title="代码" aria-label="代码">
          {"</>"}
        </button>
        <button type="button" onClick={handleQuote} style={mdBtnStyle} title="引用" aria-label="引用">
          ❝
        </button>
        <span style={{ color: "var(--text-subtle)", fontSize: 11, marginLeft: 6 }}>支持 Markdown · 选中文字后点击工具栏可包裹</span>
      </div>

      {tab === "edit" ? (
        <div style={{ position: "relative" }}>
          <textarea
            ref={taRef}
            name="content"
            required
            rows={rows}
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            style={textareaStyle}
          />
          <MentionAutocomplete textareaRef={taRef} />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            alignItems: "start",
          }}
        >
          <div style={{ position: "relative" }}>
            <textarea
              ref={taRef}
              name="content"
              required
              rows={rows}
              placeholder={placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={handlePaste}
              style={{ ...textareaStyle, minHeight: 180 }}
            />
            <MentionAutocomplete textareaRef={taRef} />
          </div>
          <div
            className="post-content"
            style={{
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "10px 12px",
              background: "var(--panel)",
              minHeight: 180,
              maxHeight: 400,
              overflowY: "auto",
              lineHeight: 1.6,
            }}
            dangerouslySetInnerHTML={{
              __html: previewHtml || '<p style="color:var(--text-subtle)">暂无内容</p>',
            }}
          />
        </div>
      )}

      {/* 工具栏:附件 / 表情 */}
      <div
        className="composer-toolbar"
        style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 28,
            padding: "0 10px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            background: "var(--panel)",
            fontSize: 12,
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          📎 添加附件
        </button>
        <button
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 28,
            padding: "0 10px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            background: "var(--panel)",
            fontSize: 12,
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          😊 表情
        </button>
        <span style={{ color: "var(--text-subtle)", fontSize: 12, marginLeft: "auto" }}>
          支持粘贴图片 · @ 提及 · 最多 {maxFiles} 个 · 单个 ≤{" "}
          {Math.round(maxBytes / 1024 / 1024)}MB
        </span>
      </div>

      {/* 表情面板 */}
      {emojiOpen && (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 10px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "var(--panel)",
            width: "fit-content",
          }}
        >
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className="emoji-btn"
              aria-label={`插入 ${e}`}
              onClick={() => insertAtCursor(e)}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {fileError && (
        <p
          style={{
            background: "var(--danger-soft)",
            color: "var(--danger)",
            border: "1px solid #fecaca",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            margin: 0,
          }}
        >
          {fileError}
        </p>
      )}

      {/* 附件预览:多图缩略图 + 移除 */}
      {files.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            border: "1px dashed var(--line)",
            borderRadius: 8,
            padding: 10,
            background: "var(--bg)",
          }}
        >
          {files.map((f, i) => {
            const isImage = f.type.startsWith("image/");
            return (
              <div
                key={`${f.name}-${i}`}
                title={`${f.name} (${formatBytes(f.size)})`}
                style={{
                  position: "relative",
                  width: 72,
                  height: 72,
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  overflow: "hidden",
                  background: "var(--panel)",
                  flexShrink: 0,
                }}
              >
                {isImage && previewUrls[i] ? (
                  <img
                    src={previewUrls[i]}
                    alt={f.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      fontSize: 20,
                      color: "var(--text-muted)",
                    }}
                  >
                    📎
                    <span style={{ fontSize: 9, maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name.split(".").pop()?.toUpperCase()}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`移除 ${f.name}`}
                  onClick={() =>
                    setFiles((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  style={{
                    position: "absolute",
                    top: 3,
                    right: 3,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(15,23,42,0.72)",
                    color: "#fff",
                    fontSize: 12,
                    lineHeight: 1,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 隐藏 file input:随表单提交 */}
      <input
        ref={fileInputRef}
        type="file"
        name="files"
        multiple
        tabIndex={-1}
        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/zip,text/plain"
        onChange={onPickFile}
        style={{ display: "none" }}
      />
    </>
  );
}
