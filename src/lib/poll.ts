/**
 * 投票帖：一个主题一个投票，支持单选/多选与截止时间。
 * 结构：Poll(1) - PollOption(N) - PollVote(N)，投票人按 (pollId, userId, optionId) 唯一。
 */
import { db } from "./db";

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 10;
export const POLL_OPTION_MAX_LEN = 40;
export const POLL_QUESTION_MAX_LEN = 100;

/** 解析「一行一个选项」的输入 */
export function parsePollOptions(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-*\d.、)）\s]+/, "").trim())
    .filter((l) => l.length > 0)
    .map((l) => l.slice(0, POLL_OPTION_MAX_LEN))
    .slice(0, POLL_MAX_OPTIONS);
}

export interface PollData {
  question: string;
  options: string[];
  multiple: boolean;
  days: number;
}

/** 从表单里提取投票数据；没有投票或选项不足时返回 null（不阻断发帖） */
export function readPollForm(formData: FormData): PollData | null {
  const question = String(formData.get("pollQuestion") ?? "").trim();
  if (!question) return null;
  const options = parsePollOptions(formData.get("pollOptions"));
  if (options.length < POLL_MIN_OPTIONS) return null;
  const multiple = formData.get("pollMultiple") === "on" || formData.get("pollMultiple") === "1";
  const days = Math.min(30, Math.max(0, Number(formData.get("pollDays") ?? 7) || 0));
  return { question: question.slice(0, POLL_QUESTION_MAX_LEN), options, multiple, days };
}

export async function createPoll(
  client: typeof db,
  threadId: string,
  data: PollData,
): Promise<void> {
  const closesAt = data.days > 0 ? new Date(Date.now() + data.days * 864e5) : null;
  await client.poll.create({
    data: {
      threadId,
      question: data.question,
      multiple: data.multiple,
      closesAt,
      options: { create: data.options.map((label, i) => ({ label, order: i })) },
    },
  });
}

export interface PollView {
  id: string;
  question: string;
  multiple: boolean;
  closesAt: string | null;
  closed: boolean;
  totalVotes: number;
  totalVoters: number;
  myVotes: string[];
  options: { id: string; label: string; count: number; pct: number }[];
}

/** 取主题的投票（含结果与我的选择） */
export async function getPollView(threadId: string, viewerId: string | null): Promise<PollView | null> {
  const poll = await db.poll
    .findUnique({
      where: { threadId },
      select: {
        id: true,
        question: true,
        multiple: true,
        closesAt: true,
        options: {
          orderBy: { order: "asc" },
          select: { id: true, label: true, _count: { select: { votes: true } } },
        },
      },
    })
    .catch(() => null);
  if (!poll) return null;

  const [myVotes, voters] = await Promise.all([
    viewerId
      ? db.pollVote.findMany({ where: { pollId: poll.id, userId: viewerId }, select: { optionId: true } })
      : Promise.resolve([] as { optionId: string }[]),
    db.pollVote.findMany({ where: { pollId: poll.id }, select: { userId: true }, distinct: ["userId"] }).catch(() => []),
  ]);

  const totalVotes = poll.options.reduce((sum, o) => sum + o._count.votes, 0);
  const closed = !!poll.closesAt && poll.closesAt.getTime() < Date.now();
  return {
    id: poll.id,
    question: poll.question,
    multiple: poll.multiple,
    closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    closed,
    totalVotes,
    totalVoters: voters.length,
    myVotes: myVotes.map((v) => v.optionId),
    options: poll.options.map((o) => ({
      id: o.id,
      label: o.label,
      count: o._count.votes,
      pct: totalVotes ? Math.round((o._count.votes / totalVotes) * 100) : 0,
    })),
  };
}

/** 投票：多选时整体覆盖，单选时替换 */
export async function castVote(pollId: string, userId: string, optionIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const poll = await db.poll.findUnique({
    where: { id: pollId },
    select: { id: true, multiple: true, closesAt: true, threadId: true, options: { select: { id: true } } },
  });
  if (!poll) return { ok: false, error: "投票不存在" };
  if (poll.closesAt && poll.closesAt.getTime() < Date.now()) return { ok: false, error: "投票已经结束了" };
  const valid = new Set(poll.options.map((o) => o.id));
  const chosen = optionIds.filter((id) => valid.has(id));
  if (chosen.length === 0) return { ok: false, error: "请选择至少一个选项" };
  if (!poll.multiple && chosen.length > 1) return { ok: false, error: "这是单选投票" };

  await db.$transaction(async (tx) => {
    await tx.pollVote.deleteMany({ where: { pollId, userId } });
    await tx.pollVote.createMany({
      data: chosen.map((optionId) => ({ pollId, userId, optionId })),
      skipDuplicates: true,
    });
  });
  return { ok: true };
}
