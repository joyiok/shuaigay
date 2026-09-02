import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getModeratedBoardIds } from "@/lib/moderators";

export default async function AdminRootPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  // 兼容旧 ?tab=xxx 链接，301 到新 /admin/xxx
  if (tab) redirect(`/admin/${tab}`);
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdminUser = isAdmin(user);
  if (!isAdminUser) {
    const boards = await getModeratedBoardIds(user.id).catch(() => new Set<string>() as Set<string>);
    if (boards.size > 0) redirect("/admin/pending");
    redirect("/admin/reports");
  }
  redirect("/admin/threads");
}
