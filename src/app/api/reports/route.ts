import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createReport } from "@/lib/moderation";
import { logger } from "@/lib/logger";

const reportSchema = z.object({
  targetType: z.enum(["thread", "post"]),
  targetId: z.string().min(1).max(64),
  reason: z.string().trim().min(1).max(500),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }

  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "举报理由需在 5~500 字之间" }, { status: 400 });
  }

  const result = await createReport(
    user.id,
    parsed.data.targetType,
    parsed.data.targetId,
    parsed.data.reason,
  );
  if (!result.ok) {
    logger.info("api.report.rejected", { userId: user.id, targetType: parsed.data.targetType, reason: result.error });
    return NextResponse.json(
      { error: result.error ?? "提交失败" },
      { status: result.status ?? 400 },
    );
  }
  logger.info("api.report.created", { userId: user.id, targetType: parsed.data.targetType, targetId: parsed.data.targetId });
  return NextResponse.json({ ok: true });
}