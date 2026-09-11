/**
 * 把 collect-stboy.py 产出的 works.json 导入本站小说区。
 *
 * 用法（本地库）：
 *   npx tsx --env-file=.env scripts/import-novels.mts /tmp/stboy/works.json
 *
 * 自动处理两个上限：单次 50 章、单章 20000 字（采集脚本已按 15000 字硬拆）。
 * 超过 50 章的作品会先建主题、再按 threadId 追加，属于同一部作品。
 */
import { readFileSync } from "node:fs";
import { importNovel } from "../src/lib/novel-import";

const BATCH_LIMIT = 50;

interface Chapter {
  title?: string;
  contentMd: string;
}
interface Work {
  importKey?: string;
  title: string;
  boardSlug?: string;
  categoryName?: string;
  authorUsername?: string;
  source?: string;
  license?: string;
  chapters: Chapter[];
}

const file = process.argv[2];
if (!file) {
  console.error("用法: tsx --env-file=.env scripts/import-novels.mts <works.json> [--dry]");
  process.exit(1);
}
const dry = process.argv.includes("--dry");
const data = JSON.parse(readFileSync(file, "utf8")) as { works: Work[] };

let okWorks = 0;
let failWorks = 0;
let totalChapters = 0;

for (const work of data.works) {
  if (!work.chapters?.length) continue;
  let threadId: string | undefined;
  let inserted = 0;
  let skipped = false;

  for (let i = 0; i < work.chapters.length; i += BATCH_LIMIT) {
    const chunk = work.chapters.slice(i, i + BATCH_LIMIT);
    if (dry) {
      console.log(`[dry] ${work.title}: ${chunk.length} 章（${i + 1}-${i + chunk.length}）`);
      inserted += chunk.length;
      continue;
    }
    const res = await importNovel({
      importKey: i === 0 ? work.importKey : undefined,
      threadId,
      title: work.title,
      boardSlug: work.boardSlug ?? "novel",
      categoryName: work.categoryName,
      authorUsername: work.authorUsername,
      source: work.source,
      license: work.license,
      chapters: chunk,
    });
    if (!res.ok) {
      console.error(`✗ ${work.title} 第 ${i + 1} 章起失败：${res.error}`);
      failWorks += 1;
      break;
    }
    threadId = res.threadId;
    skipped = Boolean(res.skipped);
    inserted += res.created;
    if (res.skipped) {
      console.log(`= 跳过（importKey 已存在）《${res.title}》 ${res.threadUrl}`);
      break;
    }
    console.log(`${i === 0 ? "＋" : "↳"} 《${res.title}》 +${res.created} 章 → 共 ${res.chapterCount} 章 ${res.threadUrl}`);
  }

  if (!skipped && inserted > 0) okWorks += 1;
  totalChapters += inserted;
}

console.log(`\n完成：${okWorks} 部成功 / ${failWorks} 部失败，写入 ${totalChapters} 章`);
process.exit(failWorks > 0 ? 1 : 0);
