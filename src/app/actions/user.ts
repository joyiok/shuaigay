"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const bioSchema = z.string().trim().max(200);
const INVITE_CODES_PER_USER = 5;

/** 生成 8 位十六进制邀请码;撞唯一索引就重试几次 */
function generateInviteCode(): string {
  return randomBytes(4).toString("hex");
}

async function createInviteCode(userId: string): Promise<boolean> {
  for (let i = 0; i < 5; i++) {
    try {
      await db.invite.create({ data: { code: generateInviteCode(), inviterId: userId } });
      return true;
    } catch {
      // 唯一冲突,换一个码再试
    }
  }
  return false;
}

/** 编辑自己的 bio(限本人,最多 200 字) */
export async function updateBioAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const bio = bioSchema.safeParse(formData.get("bio"));
  if (!bio.success) return;

  await db.user.update({ where: { id: user.id }, data: { bio: bio.data } });
  revalidatePath(`/u/${user.username}`);
}

/** 生成新邀请码:每人最多 5 个 */
export async function generateInviteAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const count = await db.invite.count({ where: { inviterId: user.id } });
  if (count >= INVITE_CODES_PER_USER) return;

  await createInviteCode(user.id);
  revalidatePath("/invite");
}