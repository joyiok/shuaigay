import { Prisma } from "@prisma/client";
import { db } from "./db";

export const MESSAGE_PAGE_SIZE = 50;
export const CONVERSATION_PAGE_SIZE = 30;

export interface ConversationSummary {
  username: string;
  avatarUrl: string | null;
  messageId: string;
  senderId: string;
  contentMd: string;
  createdAt: Date;
  unread: number;
  total: number;
}

/** PostgreSQL 在库内完成“按对方分组 + 取最后一条”，不再只看最近 200 条。 */
export async function listConversations(userId: string, page: number): Promise<{ items: ConversationSummary[]; total: number }> {
  const offset = (page - 1) * CONVERSATION_PAGE_SIZE;
  const visible = Prisma.sql`((m."senderId" = ${userId} AND m."senderDeletedAt" IS NULL) OR (m."receiverId" = ${userId} AND m."receiverDeletedAt" IS NULL))`;
  const [rows, totals] = await Promise.all([
    db.$queryRaw<Array<ConversationSummary & { unread: bigint; total: bigint }>>(Prisma.sql`
      WITH visible_messages AS (
        SELECT m.*,
          CASE WHEN m."senderId" = ${userId} THEN m."receiverId" ELSE m."senderId" END AS other_id
        FROM "DirectMessage" m
        WHERE ${visible}
      ), ranked AS (
        SELECT v.*,
          ROW_NUMBER() OVER (PARTITION BY other_id ORDER BY "createdAt" DESC, id DESC) AS rn,
          COUNT(*) OVER (PARTITION BY other_id) AS total,
          COUNT(*) FILTER (WHERE "receiverId" = ${userId} AND NOT read) OVER (PARTITION BY other_id) AS unread
        FROM visible_messages v
      )
      SELECT u.username, u."avatarUrl", r.id AS "messageId", r."senderId", r."contentMd", r."createdAt", r.unread, r.total
      FROM ranked r
      JOIN "User" u ON u.id = r.other_id
      WHERE r.rn = 1 AND u."deletedAt" IS NULL
      ORDER BY r."createdAt" DESC, r.id DESC
      LIMIT ${CONVERSATION_PAGE_SIZE} OFFSET ${offset}
    `),
    db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(DISTINCT CASE WHEN m."senderId" = ${userId} THEN m."receiverId" ELSE m."senderId" END) AS count
      FROM "DirectMessage" m
      JOIN "User" u ON u.id = CASE WHEN m."senderId" = ${userId} THEN m."receiverId" ELSE m."senderId" END
      WHERE ${visible} AND u."deletedAt" IS NULL
    `),
  ]);
  return {
    items: rows.map((row) => ({ ...row, unread: Number(row.unread), total: Number(row.total) })),
    total: Number(totals[0]?.count ?? 0),
  };
}

export async function listConversationMessages(userId: string, otherId: string, page: number) {
  const items = await db.directMessage.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: otherId, senderDeletedAt: null },
        { senderId: otherId, receiverId: userId, receiverDeletedAt: null },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * MESSAGE_PAGE_SIZE,
    take: MESSAGE_PAGE_SIZE,
  });
  const total = await db.directMessage.count({
    where: {
      OR: [
        { senderId: userId, receiverId: otherId, senderDeletedAt: null },
        { senderId: otherId, receiverId: userId, receiverDeletedAt: null },
      ],
    },
  });
  return { items: items.reverse(), total };
}
