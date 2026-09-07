import { expect, it } from "vitest";
import { aiActionSchema, parseAiDecision } from "@/lib/ai-admin";

it("AI 动作只允许白名单内的可逆管理操作", () => {
  expect(aiActionSchema.safeParse({
    type: "set_thread_lock", threadId: "thread-1", locked: true, reason: "疑似广告", confidence: 0.95,
  }).success).toBe(true);
  expect(aiActionSchema.safeParse({
    type: "delete_thread", threadId: "thread-1", reason: "违规", confidence: 1,
  }).success).toBe(false);
});

it("AI 决策支持 JSON 代码块", () => {
  const decision = parseAiDecision('```json\n{"summary":"发现广告","actions":[]}\n```');
  expect(decision.summary).toBe("发现广告");
  expect(decision.actions).toEqual([]);
});
