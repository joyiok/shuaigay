import { NextResponse } from "next/server";
import { authenticateAiCronRequest, authenticateAiRequest } from "@/lib/ai-admin";
import { runNovelAuto } from "@/lib/novel-auto";

export const runtime = "nodejs";

/**
 * 自动追更入口：
 * - 容器内 crond 带 X-AI-Cron-Key 调用（每 30 分钟一次）
 * - 也可以用管理密钥（Bearer）手动触发
 */
export async function POST(req: Request) {
  const auth = req.headers.has("x-ai-cron-key")
    ? await authenticateAiCronRequest(req)
    : await authenticateAiRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await runNovelAuto();
  const status = result.status === "ok" || result.status === "empty" ? 200 : result.status === "busy" ? 409 : 200;
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
