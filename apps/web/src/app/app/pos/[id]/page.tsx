import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import Link from "next/link";
import { PODetailClient } from "./po-detail-client";

export default async function PODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) redirect("/app/setup");
  const { id } = await params;
  const canWrite = active.role === "ADMIN" || active.role === "APPROVER" || active.role === "STAFF";
  return (
    <div>
      <Link href="/app/pos" className="text-sm text-slate-600 hover:underline dark:text-slate-400">← Back to POs</Link>
      <PODetailClient orgId={active.id} poId={id} canWrite={canWrite} />
    </div>
  );
}
