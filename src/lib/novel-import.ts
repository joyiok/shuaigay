/**
 * 小说批量导入（MCP 用）。
 *
 * 只做「导入」这一半：调用方提供标题 + 章节正文，本模块负责落库成
 * 「一个作品一个主题、一章一条作者回复」的结构，自动适配小说阅读器。
 * 本模块不做任何抓取/下载；调用方必须确保内容有权发布（原创/授权/公版）。
 */
import { z } from "zod";
import { db } from "./db";
import { logger } from "./logger";
import { novelChapterTitle } from "./novel";
import { threadHref } from "./slug";

export const MAX_IMPORT_CHAPTERS = 50;
/** 单章上限与站内回复一致（threads.ts 的 contentSchema） */
export const MAX_CHAPTER_CHARS = 20_000;

export const importNovelSchema = z.object({
  /** 追加模式：向已有作品续写章节 */
  threadId: z.string().trim().min(1).max(64).optional(),
  /** 新建模式：目标版块，默认小说版 */
  boardSlug: z.string().trim().min(1).max(64).default("novel"),
  title: z.string().trim().min(5).max(120).optional(),
  categoryName: z.string().trim().min(1).max(20).optional(),
  /** 作者账号；缺省用最早的管理员 */
  authorUsername: z.string().trim().min(3).max(20).optional(),
  /** 来源与授权说明，新建时附在首章末尾留痕 */
  source: z.string().trim().max(200).optional(),
  license: z.string().trim().max(200).optional(),
  /** 允许自动追更：AI 生成的作品默认 true；手工导入默认 false */
  autoContinue: z.boolean().optional(),
  chapters: z
    .array(
      z.object({
        title: z.string().trim().max(120).optional(),
        contentMd: z.string().trim().min(1).max(MAX_CHAPTER_CHARS),
      }),
    )
    .min(1)
    .max(MAX_IMPORT_CHAPTERS),
});

export type ImportNovelInput = z.infer<typeof importNovelSchema>;

export interface ImportNovelResult {
  ok: boolean;
  error?: string;
  threadId?: string;
  threadUrl?: string;
  boardSlug?: string;
  title?: string;
  /** 本次写入的章节数 */
  created: number;
  /** 该书导入后的总章节数 */
  chapterCount: number;
  /** 本次第一章的全局序号（从 1 开始） */
  firstChapterIndex: number;
}

/** 章标题：传了 title 且正文首行不是同名标题时，补一行 # 标题，保证阅读器目录显示一致 */
export function withChapterTitle(chapter: { title?: string; contentMd: string }): string {
  const title = chapter.title?.trim();
  if (!title) return chapter.contentMd;
  const firstLine = chapter.contentMd.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const clean = firstLine.replace(/^#+\s*/, "").replace(/[*_`>]/g, "").trim();
  return clean === title ? chapter.contentMd : `# ${title}\n\n${chapter.contentMd}`;
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "未知错误";
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

async function adminActorId(): Promise<string | null> {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return admin?.id ?? null;
}

/**
 * 导入小说：
 * - 传 threadId：向该作品追加章节（章节作者固定为该主题作者，保证阅读器识别为章节）
 * - 不传 threadId：新建作品，首章作为主题首帖，其余作为作者回复
 */
export async function importNovel(raw: unknown): Promise<ImportNovelResult> {
  const parsed = importNovelSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `参数不合法：${firstIssue(parsed.error)}`, created: 0, chapterCount: 0, firstChapterIndex: 0 };
  }
  const input = parsed.data;
  const actor = await adminActorId();

  /* ---------- 追加模式 ---------- */
  if (input.threadId) {
    const thread = await db.thread.findUnique({
      where: { id: input.threadId },
      select: { id: true, title: true, authorId: true, board: { select: { slug: true } } },
    });
    if (!thread) return { ok: false, error: "主题不存在", created: 0, chapterCount: 0, firstChapterIndex: 0 };

    const existing = await db.post.count({ where: { threadId: thread.id, authorId: thread.authorId } });
    const base = Date.now();
    const rows = input.chapters.map((chapter, i) => ({
      threadId: thread.id,
      authorId: thread.authorId,
      contentMd: withChapterTitle(chapter),
      status: "approved",
      createdAt: new Date(base + i),
    }));
    await db.$transaction([
      ...rows.map((data) => db.post.create({ data })),
      db.thread.update({ where: { id: thread.id }, data: { lastPostAt: rows[rows.length - 1]!.createdAt } }),
    ]);
    if (actor) {
      await db.auditLog
        .create({ data: { actorId: actor, action: "import_novel", targetType: "thread", targetId: thread.id, detail: `追加 ${rows.length} 章` } })
        .catch(() => {});
    }
    logger.info("mcp.import_novel_append", { threadId: thread.id, created: rows.length, total: existing + rows.length });
    return {
      ok: true,
      threadId: thread.id,
      threadUrl: threadHref(thread.id, thread.title),
      boardSlug: thread.board.slug,
      title: thread.title,
      created: rows.length,
      chapterCount: existing + rows.length,
      firstChapterIndex: existing + 1,
    };
  }

  /* ---------- 新建模式 ---------- */
  if (!input.title) return { ok: false, error: "新建作品必须提供 title（5-120 字）", created: 0, chapterCount: 0, firstChapterIndex: 0 };

  const board = await db.board.findUnique({ where: { slug: input.boardSlug }, select: { id: true, slug: true, name: true } });
  if (!board) return { ok: false, error: `版块 ${input.boardSlug} 不存在`, created: 0, chapterCount: 0, firstChapterIndex: 0 };

  let categoryId: string | null = null;
  if (input.categoryName) {
    const category = await db.threadCategory.findUnique({ where: { boardId_name: { boardId: board.id, name: input.categoryName } }, select: { id: true } });
    if (!category) return { ok: false, error: `版块「${board.name}」没有分类「${input.categoryName}」`, created: 0, chapterCount: 0, firstChapterIndex: 0 };
    categoryId = category.id;
  }

  const author = input.authorUsername
    ? await db.user.findUnique({ where: { username: input.authorUsername }, select: { id: true, username: true } })
    : await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true, username: true } });
  if (!author) return { ok: false, error: "作者账号不存在：可传 authorUsername，或先创建管理员账号", created: 0, chapterCount: 0, firstChapterIndex: 0 };

  const notes = [input.source ? `来源：${input.source}` : "", input.license ? `授权：${input.license}` : ""].filter(Boolean);
  const firstChapter = withChapterTitle(input.chapters[0]!);
  const firstContent = notes.length ? `${firstChapter}\n\n---\n${notes.map((n) => `> ${n}`).join("\n")}` : firstChapter;

  const base = Date.now();
  const thread = await db.$transaction(async (tx) => {
    const created = await tx.thread.create({
      data: {
        boardId: board.id,
        authorId: author.id,
        title: input.title!,
        categoryId,
        status: "approved",
        autoContinue: input.autoContinue ?? false,
        createdAt: new Date(base),
        lastPostAt: new Date(base + input.chapters.length - 1),
      },
      select: { id: true, title: true },
    });
    await tx.post.createMany({
      data: input.chapters.map((chapter, i) => ({
        threadId: created.id,
        authorId: author.id,
        contentMd: i === 0 ? firstContent : withChapterTitle(chapter),
        status: "approved",
        createdAt: new Date(base + i),
      })),
    });
    return created;
  });

  if (actor) {
    await db.auditLog
      .create({ data: { actorId: actor, action: "import_novel", targetType: "thread", targetId: thread.id, detail: `${input.chapters.length} 章` } })
      .catch(() => {});
  }
  logger.info("mcp.import_novel_create", { threadId: thread.id, board: board.slug, created: input.chapters.length, author: author.username });

  return {
    ok: true,
    threadId: thread.id,
    threadUrl: threadHref(thread.id, thread.title),
    boardSlug: board.slug,
    title: thread.title,
    created: input.chapters.length,
    chapterCount: input.chapters.length,
    firstChapterIndex: 1,
  };
}

/** 读取某作品的章节清单（供续写/去重对账） */
export async function getNovelChapters(rawThreadId: string, rawLimit?: number) {
  const threadId = String(rawThreadId ?? "").trim();
  if (!threadId) return { ok: false as const, error: "缺少 threadId" };
  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, title: true, authorId: true, board: { select: { slug: true, name: true } }, author: { select: { username: true } } },
  });
  if (!thread) return { ok: false as const, error: "主题不存在" };

  const limit = Math.max(1, Math.min(500, Math.floor(Number(rawLimit) || 200)));
  const [posts, total] = await Promise.all([
    db.post.findMany({
      where: { threadId: thread.id, authorId: thread.authorId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true, contentMd: true, createdAt: true },
    }),
    db.post.count({ where: { threadId: thread.id, authorId: thread.authorId } }),
  ]);

  return {
    ok: true as const,
    threadId: thread.id,
    title: thread.title,
    boardSlug: thread.board.slug,
    boardName: thread.board.name,
    author: thread.author.username,
    total,
    chapters: posts.map((p, i) => ({
      index: i + 1,
      id: p.id,
      title: novelChapterTitle(p.contentMd, i + 1),
      length: p.contentMd.length,
      createdAt: p.createdAt,
    })),
  };
}
