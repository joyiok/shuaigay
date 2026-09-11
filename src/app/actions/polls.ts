"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { castVote } from "@/lib/poll";
import { assertNotBanned } from "@/lib/ban";
import { checkRateLimit } from "@/lib/ratelimit";

/** 投票：表单里 pollId + optionId（多选时同名多个） */
export async function votePollAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await assertNotBanned(user.id).catch(() => {});

  const pollId = String(formData.get("pollId") ?? "");
  const optionIds = formData.getAll("optionId").map(String).filter(Boolean);
  const back = String(formData.get("back") ?? "/");
  if (!pollId || optionIds.length === 0) return;

  // 防止刷票：每人每分钟 20 次
  if (!(await checkRateLimit(`poll:${user.id}`, 20, 60))) return;

  const poll = await db.poll.findUnique({ where: { id: pollId }, select: { threadId: true } });
  const result = await castVote(pollId, user.id, optionIds);
  if (result.ok && poll) revalidatePath(`/t/${poll.threadId}`);
  if (!result.ok && poll) {
    const { redirect } = await import("next/navigation");
    redirect(`/t/${poll.threadId}?error=poll`);
  }
}
