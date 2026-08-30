"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  INVITE_CODES_PER_USER,
  createInviteCode,
} from "@/lib/invite";

const bioSchema = z.string().trim().max(200);

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