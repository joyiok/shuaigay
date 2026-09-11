import { votePollAction } from "@/app/actions/polls";
import type { PollView } from "@/lib/poll";

/** 投票卡片：可投 -> 表单；已投/已结束 -> 结果条 */
export default function PollCard({ poll, canVote }: { poll: PollView; canVote: boolean }) {
  const voted = poll.myVotes.length > 0;
  const showForm = canVote && !poll.closed && !voted;

  return (
    <div className="card poll-card" style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="topic-badge" style={{ background: "var(--brand-soft)", color: "var(--brand)", border: "none", fontWeight: 800 }}>
          投票
        </span>
        <strong style={{ fontSize: 15 }}>{poll.question}</strong>
        {poll.multiple && <span style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>多选</span>}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-subtle)", fontFamily: "var(--font-jet)" }}>
          {poll.totalVoters} 人参与 · {poll.totalVotes} 票
          {poll.closed ? " · 已结束" : poll.closesAt ? ` · ${new Date(poll.closesAt).toLocaleDateString("zh-CN")} 截止` : ""}
        </span>
      </div>

      <form action={votePollAction} style={{ display: "grid", gap: 8 }}>
        <input type="hidden" name="pollId" value={poll.id} />
        {poll.options.map((o) => {
          const mine = poll.myVotes.includes(o.id);
          return (
            <label
              key={o.id}
              style={{
                display: "grid",
                gap: 6,
                padding: "9px 12px",
                borderRadius: 10,
                border: `1px solid ${mine ? "var(--brand)" : "var(--line-soft)"}`,
                background: mine ? "var(--brand-soft)" : "var(--bg-soft)",
                cursor: showForm ? "pointer" : "default",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: mine ? 700 : 500 }}>
                {showForm && (
                  <input type={poll.multiple ? "checkbox" : "radio"} name="optionId" value={o.id} required={!poll.multiple} />
                )}
                <span style={{ flex: 1 }}>{o.label}</span>
                <span style={{ fontFamily: "var(--font-jet)", fontSize: 12, color: "var(--text-muted)" }}>
                  {o.count} 票 · {o.pct}%
                </span>
              </span>
              {!showForm && (
                <span style={{ height: 6, background: "var(--panel)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--line-soft)" }}>
                  <span style={{ display: "block", width: `${Math.max(2, o.pct)}%`, height: "100%", background: mine ? "var(--brand)" : "var(--line)" }} />
                </span>
              )}
            </label>
          );
        })}
        {showForm && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="submit"
              style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "1px solid var(--brand)", background: "var(--brand)", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
            >
              投票
            </button>
            <span style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>投票后不可修改{poll.multiple ? "，可多选" : ""}</span>
          </div>
        )}
      </form>
      {!showForm && !voted && !poll.closed && (
        <div style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>登录后可参与投票，当前显示实时结果。</div>
      )}
    </div>
  );
}
