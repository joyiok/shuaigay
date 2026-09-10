"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getLocalStorage, scanDrafts, type DraftEntry } from "@/lib/draft";

const KIND_LABEL: Record<string, string> = {
  reply: "回复",
  new: "新主题",
  msg: "私信",
};
import { resolveDraftTargets, type DraftTargetMeta } from "@/app/actions/drafts";

function excerpt(raw: string, max = 90): string {
  const t = raw.replace(/[#*_`>[\]()!]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  return new Date(ms).toLocaleDateString("zh-CN");
}

export default function DraftsList({ userId, newThreadHref }: { userId: string; newThreadHref?: string | null }) {
  const [items, setItems] = useState<(DraftEntry & { meta?: DraftTargetMeta })[] | null>(null);

  useEffect(() => {
    const found = scanDrafts(getLocalStorage(), userId);
    setItems(found);
    if (found.length === 0) return;
    let alive = true;
    resolveDraftTargets(found.map((i) => ({ kind: i.kind, id: i.id })))
      .then((metas) => {
        if (!alive) return;
        const byKey = new Map(metas.map((m) => [`${m.kind}:${m.id}`, m]));
        setItems(found.map((i) => ({ ...i, meta: byKey.get(`${i.kind}:${i.id}`) })));
      })
      .catch(() => {
        /* 解析失败就只显示草稿内容 */
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const remove = (item: DraftEntry) => {
    const store = getLocalStorage();
    if (store) {
      for (const k of item.keys) {
        try {
          store.removeItem(k);
        } catch {
          /* ignore */
        }
      }
    }
    setItems((prev) => (prev ? prev.filter((i) => i !== item) : prev));
  };

  if (items === null) {
    return <p style={{ color: "var(--text-subtle)", fontSize: 13 }}>正在读取本机草稿…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="card" style={{ padding: "32px 20px", textAlign: "center", display: "grid", gap: 10, justifyItems: "center" }}>
        <div aria-hidden="true" className="auth-gate-icon" style={{ width: 52, height: 52, borderRadius: 15 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
            <path d="M14 3v5h5M9 13h6M9 17h4" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <strong style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>草稿箱是空的</strong>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-subtle)", maxWidth: 360, lineHeight: 1.7 }}>
          发帖、回帖、私信写了一半没提交，会自动存在这台设备上（保留 7 天），下次回来在这里接着写。
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {newThreadHref && (
            <Link href={newThreadHref} className="btn-publish" style={{ minHeight: 38 }}>
              写新主题
            </Link>
          )}
          <Link href="/" className="btn-ghost">
            去逛逛
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item) => {
        const meta = item.meta;
        const preview = excerpt(item.text || item.titleText);
        return (
          <article key={`${item.kind}:${item.id}`} className="card" style={{ padding: 14, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="topic-badge" style={{ background: "var(--brand-soft)", color: "var(--brand)", border: "1px solid #ddd6fe" }}>
                {KIND_LABEL[item.kind] ?? item.kind}
              </span>
              <strong style={{ fontSize: 13.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {meta?.title ?? (item.kind === "msg" ? `发给 ${item.id}` : "草稿")}
              </strong>
              {meta?.missing && (
                <span className="topic-badge" style={{ background: "#fef2f2", color: "var(--danger)", border: "1px solid #fecaca" }}>
                  目标已删除
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-subtle)" }}>{timeAgo(item.at)}</span>
            </div>
            {item.titleText && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                <span style={{ color: "var(--text-subtle)" }}>标题：</span>
                {item.titleText.slice(0, 60)}
              </div>
            )}
            {preview ? (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>{preview}</p>
            ) : (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-subtle)" }}>（只有标题草稿）</p>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {meta?.href ? (
                <Link
                  href={meta.href}
                  style={{ fontSize: 12, fontWeight: 700, height: 30, padding: "0 14px", display: "inline-flex", alignItems: "center", background: "var(--brand)", color: "#fff", borderRadius: 8, border: "1px solid var(--brand)" }}
                >
                  继续写 →
                </Link>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>无法继续：{meta?.subtitle ?? "目标不可用"}</span>
              )}
              <button
                type="button"
                onClick={() => remove(item)}
                style={{ fontSize: 12, height: 30, padding: "0 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--text-muted)", cursor: "pointer" }}
              >
                删除草稿
              </button>
              {meta?.subtitle && <span style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>{meta.subtitle}</span>}
            </div>
          </article>
        );
      })}
      <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-subtle)", textAlign: "center" }}>
        草稿只存在这台设备上，保留 7 天；换设备或清理浏览器数据会丢失。
      </p>
    </div>
  );
}
