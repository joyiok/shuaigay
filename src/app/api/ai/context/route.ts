import { NextRequest, NextResponse } from "next/server";
import { authenticateAiRequest, getAiContext } from "@/lib/ai-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await authenticateAiRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const context = await getAiContext(req.nextUrl.searchParams.get("limit"));
  return NextResponse.json(context, { headers: { "Cache-Control": "no-store" } });
}
