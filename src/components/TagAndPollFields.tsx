"use client";

import { useState } from "react";
import { MAX_TAGS_PER_THREAD } from "@/lib/taxonomy";

/**
 * 发帖表单的「标签」与「投票」两块可选内容。
 * 标签：逗号/空格分隔，最多 3 个；投票：一行一个选项，2-10 行。
 */
export default function TagAndPollFields({ allowPoll = true }: { allowPoll?: boolean }) {
  const [pollOn, setPollOn] = useState(false);
  const [options, setOptions] = useState("");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
          标签（可选，最多 {MAX_TAGS_PER_THREAD} 个，用逗号或空格分隔）
        </span>
        <input
          name="tags"
          maxLength={60}
          placeholder="例如：都市 悬疑 长篇"
          autoComplete="off"
          style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 14, outline: "none" }}
        />
      </label>

      {allowPoll && (
        <div style={{ display: "grid", gap: 10, border: "1px dashed var(--line)", borderRadius: 10, padding: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={pollOn} onChange={(e) => setPollOn(e.target.checked)} />
            附带投票
            <span style={{ fontWeight: 400, color: "var(--text-subtle)", fontSize: 11.5 }}>适合征求意见、做选择</span>
          </label>
          {pollOn && (
            <div style={{ display: "grid", gap: 10 }}>
              <input
                name="pollQuestion"
                maxLength={100}
                placeholder="投票问题，例如：下一位主角的设定？"
                style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 14, outline: "none" }}
              />
              <textarea
                name="pollOptions"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                rows={4}
                placeholder={"一行一个选项，至少 2 个\n选项 A\n选项 B"}
                style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit" }}
              />
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" name="pollMultiple" />
                  允许多选
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  截止
                  <select name="pollDays" defaultValue="7" style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", background: "var(--panel)" }}>
                    <option value="1">1 天后</option>
                    <option value="3">3 天后</option>
                    <option value="7">7 天后</option>
                    <option value="14">14 天后</option>
                    <option value="0">不设截止</option>
                  </select>
                </label>
                <span style={{ color: "var(--text-subtle)" }}>
                  已填 {options.split("\n").filter((l) => l.trim()).length} 个选项
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
