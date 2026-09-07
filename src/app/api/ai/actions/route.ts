import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAiRequest, aiActionSchema, executeAiActions } from "@/lib/ai-admin";

export const runtime = "nodejs";

const requestSchema = z.object({ actions: z.array(aiActionSchema).min(1).max(20), dryRun: z.boolean().default(false) });

export async function POST(req: Request) {
  const auth = await authenticateAiRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求必须是 JSON" }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "动作格式不符合白名单", details: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await executeAiActions(parsed.data.actions, { dryRun: parsed.data.dryRun }));
  } catch {
    return NextResponse.json({ error: "AI 管理动作执行失败" }, { status: 500 });
  }
}
