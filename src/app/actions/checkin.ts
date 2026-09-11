"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { doCheckIn } from "@/lib/checkin";
import { logger } from "@/lib/logger";

export async function checkInAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/");
  const result = await doCheckIn(user.id);
  if (result.ok) logger.info("checkin.done", { userId: user.id, points: result.points, streak: result.streak });
  revalidatePath("/");
  redirect(result.ok ? `/?checkin=ok&points=${result.points}&streak=${result.streak}` : "/?checkin=dup");
}
