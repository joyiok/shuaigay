/**
 * AI 小说生成（MCP 用）。
 *
 * 复用管理后台「AI 自动运营」里的模型配置（baseUrl / model / 模型服务密钥），
 * 生成原创虚构章节，可直接落库成「作品 + 章节」结构（复用 importNovel）。
 *
 * 内容红线（写进 system prompt，且生成后仍可先 pending 人工过一遍）：
 * 禁止现实人物/机构、未成年人恋爱或性内容、露骨性描写、非自愿性行为、
 * 暴力猎奇、违法教程、仇恨内容。男男情感题材可以写，但保持剧情/情感向。
 */
import { z } from "zod";
import { db } from "./db";
import { getWriterSettings } from "./writer-settings";
import { importNovel } from "./novel-import";
import { checkRateLimit } from "./ratelimit";
import { logger } from "./logger";

const MAX_WORDS = 1500;
const CONTEXT_CHARS_PER_CHAPTER = 1200;
const CONTEXT_CHAPTERS = 3;

export const novelGenSchema = z.object({
  /** 续写已有作品；不传则新建 */
  threadId: z.string().trim().min(1).max(64).optional(),
  /** 新建时的设定/开篇要求 */
  premise: z.string().trim().min(10).max(600).optional(),
  /** 新建时的作品名；不传由模型拟 */
  title: z.string().trim().min(2).max(60).optional(),
  categoryName: z.string().trim().min(1).max(20).optional(),
  authorUsername: z.string().trim().min(3).max(20).optional(),
  /** 题材，如 都市/校园/悬疑/奇幻 */
  style: z.string().trim().max(30).optional(),
  /** 基调，如 温暖/轻松/虐心 */
  tone: z.string().trim().max(30).optional(),
  /** 目标字数；缺省用 AI 写作设置里的默认值 */
  words: z.number().int().min(300).max(MAX_WORDS).optional(),
  /** false 只生成不落库（预览） */
  import: z.boolean().default(true),
  /** 落库状态：approved 直接发布 / pending 进待审队列人工过一遍；缺省用设置里的默认值 */
  status: z.enum(["approved", "pending"]).optional(),
  /** 生成时额外要求（会拼进 prompt） */
  instruction: z.string().trim().max(300).optional(),
});

export type NovelGenInput = z.infer<typeof novelGenSchema>;

export interface NovelGenResult {
  ok: boolean;
  error?: string;
  title?: string;
  chapterTitle?: string;
  contentMd?: string;
  threadId?: string;
  threadUrl?: string;
  chapterCount?: number;
  imported?: boolean;
  model?: string;
}

export interface NovelDraft {
  title: string;
  chapterTitle: string;
  contentMd: string;
}

/** 从模型返回里抠出 JSON（容忍 ```json 包裹与前后废话） */
export function parseNovelJson(raw: string): NovelDraft | null {
  const cleaned = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const text of candidates) {
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      const contentMd = typeof data.contentMd === "string" ? data.contentMd.trim() : "";
      if (!contentMd) continue;
      return {
        title: typeof data.title === "string" ? data.title.trim().slice(0, 60) : "",
        chapterTitle: typeof data.chapterTitle === "string" ? data.chapterTitle.trim().slice(0, 60) : "",
        contentMd: contentMd.slice(0, 20_000),
      };
    } catch {
      /* 尝试下一个候选 */
    }
  }
  return null;
}

function modelText(payload: unknown): string {
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? "")).join("");
  return "";
}

const SYSTEM_PROMPT = [
  "你是中文网络小说作者，只输出 JSON，不要输出 JSON 以外的任何内容。",
  "硬性红线（必须遵守）：",
  "- 只写原创虚构内容；不得使用现实人物、真实机构、真实事件。",
  "- 禁止任何未成年人的恋爱或性内容；禁止露骨性描写、非自愿性行为、性暴力。",
  "- 禁止违法教程、暴力猎奇、仇恨与歧视内容。",
  "- 男男情感题材可以写，但保持剧情与情感向，亲密描写点到为止。",
  "写作要求：有场景、对话与冲突推进；结尾留一个钩子；使用 Markdown（章节标题用 # 开头）。",
  '输出格式：{"title":"作品名","chapterTitle":"本章标题","contentMd":"Markdown 正文"}',
].join("\n");

async function buildContext(threadId: string) {
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, title: true, authorId: true, author: { select: { username: true } }, board: { select: { slug: true } } },
  });
  if (!thread) return null;
  const [recent, total] = await Promise.all([
    db.post.findMany({
      where: { threadId: thread.id, authorId: thread.authorId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CONTEXT_CHAPTERS,
      select: { contentMd: true },
    }),
    db.post.count({ where: { threadId: thread.id, authorId: thread.authorId } }),
  ]);
  const context = recent
    .reverse()
    .map((p, i) => `【第 ${total - recent.length + i + 1} 章节选】\n${p.contentMd.slice(0, CONTEXT_CHARS_PER_CHAPTER)}`)
    .join("\n\n");
  return { thread, total, context };
}

/**
 * 生成一章小说；import=true 时直接落库。
 * - 不传 threadId：新建作品（生成作品名 + 第一章）
 * - 传 threadId：读取最近几章做前情，续写下一章
 */
export async function generateNovelChapter(raw: unknown): Promise<NovelGenResult> {
  const parsed = novelGenSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `参数不合法：${parsed.error.issues[0]?.message ?? "未知错误"}` };
  }
  const input = parsed.data;

  const writer = await getWriterSettings();
  if (!writer.enabled) {
    return { ok: false, error: "AI 写作未启用：请到管理后台「AI 写作」开启并配置模型" };
  }
  if (!writer.apiKey) {
    return { ok: false, error: "AI 写作模型密钥未配置：请到管理后台「AI 写作」填写模型服务密钥" };
  }
  const words = input.words ?? writer.defaultWords;
  const status = input.status ?? writer.defaultStatus;
  if (!(await checkRateLimit("novel-ai", 8, 60))) {
    return { ok: false, error: "生成过于频繁，请稍后再试（每分钟最多 8 次）" };
  }

  let userPrompt: string;
  let existing: Awaited<ReturnType<typeof buildContext>> = null;
  if (input.threadId) {
    existing = await buildContext(input.threadId);
    if (!existing) return { ok: false, error: "要续写的作品不存在" };
    const next = existing.total + 1;
    userPrompt = [
      `已有作品《${existing.thread.title}》，作者：${existing.thread.author.username}。`,
      existing.context ? `前情提要：\n${existing.context}` : "这是作品的第一章。",
      input.style ? `题材：${input.style}` : "",
      input.tone ? `基调：${input.tone}` : "",
      input.premise ? `额外设定：${input.premise}` : "",
      input.instruction ? `本章要求：${input.instruction}` : "",
      `请续写第 ${next} 章，约 ${words} 字。chapterTitle 用「第 ${next} 章 标题」格式。`,
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    if (!input.premise && !input.title) return { ok: false, error: "新建作品至少提供 premise（设定/开篇要求）或 title" };
    userPrompt = [
      input.title ? `作品名：${input.title}` : "作品名：由你拟定（2-12 字，有记忆点）",
      input.style ? `题材：${input.style}` : "",
      input.tone ? `基调：${input.tone}` : "",
      input.premise ? `设定与开篇要求：${input.premise}` : "",
      input.instruction ? `额外要求：${input.instruction}` : "",
      `请写第一章，约 ${words} 字。`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const baseUrl = writer.baseUrl.replace(/\/$/, "");
  let rawText = "";
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${writer.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: writer.model,
        temperature: writer.temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error("mcp.novel_ai_failed", { status: response.status });
      return { ok: false, error: `模型返回 ${response.status}${body ? `：${body.slice(0, 160)}` : ""}` };
    }
    rawText = modelText(await response.json());
  } catch (error) {
    logger.error("mcp.novel_ai_error", { error: String(error) });
    return { ok: false, error: "调用模型失败或超时，请稍后重试" };
  }

  const draft = parseNovelJson(rawText);
  if (!draft) return { ok: false, error: "模型输出无法解析为 JSON，请重试或换模型" };

  const result: NovelGenResult = {
    ok: true,
    title: draft.title || input.title || existing?.thread.title,
    chapterTitle: draft.chapterTitle,
    contentMd: draft.contentMd,
    imported: false,
    model: writer.model,
  };

  if (!input.import) return result;

  const imported = existing
    ? await importNovel({ threadId: existing.thread.id, chapters: [{ title: draft.chapterTitle, contentMd: draft.contentMd }] })
    : await importNovel({
        boardSlug: "novel",
        title: draft.title || input.title || "AI 小说",
        categoryName: input.categoryName,
        authorUsername: input.authorUsername,
        source: "AI 生成",
        license: "AI 生成内容（原创虚构）",
        autoContinue: true,
        chapters: [{ title: draft.chapterTitle, contentMd: draft.contentMd }],
      });

  if (!imported.ok) {
    return { ...result, error: `生成成功但落库失败：${imported.error}` };
  }
  // pending 状态：把刚写入的章节改成待审
  if (status === "pending" && imported.threadId) {
    const last = await db.post.findFirst({
      where: { threadId: imported.threadId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, authorId: true },
    });
    if (last) await db.post.update({ where: { id: last.id }, data: { status: "pending" } }).catch(() => {});
  }

  logger.info("mcp.novel_ai_generated", { threadId: imported.threadId, chapter: imported.firstChapterIndex, words: draft.contentMd.length });
  return {
    ...result,
    imported: true,
    threadId: imported.threadId,
    threadUrl: imported.threadUrl,
    chapterCount: imported.chapterCount,
  };
}
