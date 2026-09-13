"use client";

import { useActionState } from "react";
import { unstable_rethrow } from "next/navigation";
import { checkInAction } from "@/app/actions/checkin";
import type { CheckInState } from "@/lib/checkin";

export default function CheckInCard({ state }: { state: CheckInState }) {
  const [result, action, pending] = useActionState(async () => {
    try {
      return await checkInAction();
    } catch (error) {
      unstable_rethrow(error);
      return { ok: false, error: "签到未完成，请检查网络后重试。" };
    }
  }, null);
  const celebrated = result?.ok === true;

  return (
    <section className="checkin-card" aria-label="每日签到" data-celebrate={celebrated}>
      <div className="checkin-heading">
        <h2>每日签到</h2>
        <span>本月 <strong>{state.monthCount}</strong> 天</span>
      </div>
      <div className="checkin-summary">
        <span className="checkin-stamp" data-done={state.doneToday} aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            {state.doneToday ? <path className="checkin-tick" pathLength="1" d="m5 12 4 4L19 6" /> : <>
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3v4m8-4v4M4 10h16m-8 3v4m-2-2h4" />
            </>}
          </svg>
        </span>
        <div>
          <p className="checkin-streak">{state.streak > 0 ? <>连续签到 <strong>{state.streak}</strong> 天</> : "今天，从签到开始"}</p>
          <p className="checkin-caption">{state.doneToday ? "今天的足迹已留下，明天见" : "每天来坐坐，积攒一点小收获"}</p>
        </div>
      </div>
      <div className="checkin-history" role="img" aria-label={`最近 14 天，从左到右：${state.recent.map((hit, i) => `${i === 13 ? "今天" : `${13 - i}天前`}${hit ? "已签到" : "未签到"}`).join("，")}`}>
        {state.recent.map((hit, i) => (
          <span key={i} className="checkin-day" data-hit={hit} data-today={i === 13} title={`${i === 13 ? "今天" : `${13 - i} 天前`} · ${hit ? "已签到" : "未签到"}`} />
        ))}
      </div>
      <div className="checkin-history-labels" aria-hidden="true"><span>近 14 天</span><span>今天</span></div>
      <form action={action}>
        <button className="checkin-button" type="submit" disabled={pending || state.doneToday} aria-busy={pending}>
          {pending && <span className="infinite-spinner" aria-hidden="true" />}
          {pending ? "正在签到…" : state.doneToday ? "今天已签到" : <>签到 <span>+{state.nextPoints} 积分</span></>}
        </button>
      </form>
      <div className="checkin-feedback" role="status" aria-live="polite" aria-atomic="true">
        {celebrated && "points" in result ? <span className="checkin-reward">+{result.points} 积分已到账</span> : result?.error || (state.doneToday ? "明天继续，延续你的签到记录" : "连续签到可获得更多积分")}
      </div>
    </section>
  );
}
