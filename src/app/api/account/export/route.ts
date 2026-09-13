import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const data = await db.user.findUnique({
    where: { id: me.id },
    select: {
      id: true, email: true, username: true, bio: true, avatarUrl: true, emailVerified: true,
      registrationIp: true, lastLoginIp: true, lastLoginAt: true, lastActiveIp: true, lastActiveAt: true, createdAt: true,
      threads: { select: { id: true, title: true, status: true, createdAt: true, lastPostAt: true } },
      posts: { select: { id: true, threadId: true, contentMd: true, status: true, createdAt: true } },
      sentMessages: { select: { id: true, receiver: { select: { username: true } }, contentMd: true, read: true, createdAt: true } },
      receivedMessages: { select: { id: true, sender: { select: { username: true } }, contentMd: true, read: true, createdAt: true } },
      notifications: { select: { type: true, title: true, body: true, link: true, read: true, createdAt: true } },
      favorites: { select: { threadId: true, createdAt: true } },
      following: { select: { following: { select: { username: true } }, createdAt: true } },
      followers: { select: { follower: { select: { username: true } }, createdAt: true } },
      reports: { select: { targetType: true, targetId: true, reason: true, status: true, createdAt: true } },
      checkIns: { select: { day: true, points: true, streak: true, createdAt: true } },
      pointTransactions: { select: { delta: true, balance: true, reason: true, refType: true, refId: true, createdAt: true } },
      medals: { select: { medal: { select: { name: true } }, reason: true, createdAt: true } },
      ipLogs: { select: { ip: true, action: true, createdAt: true } },
    },
  });
  if (!data) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), account: data }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="shuaigay-${encodeURIComponent(me.username)}-data.json"`,
      "cache-control": "private, no-store",
    },
  });
}
