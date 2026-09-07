import { NextResponse } from "next/server";
import { authenticateAiCronRequest, authenticateAiRequest, runAiAutomation } from "@/lib/ai-admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = req.headers.has("x-ai-cron-key")
    ? await authenticateAiCronRequest(req)
    : await authenticateAiRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const result = await runAiAutomation();
  const status = result.status === "ok" ? 200 : result.status === "busy" || result.status === "disabled" ? 409 : 503;
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
