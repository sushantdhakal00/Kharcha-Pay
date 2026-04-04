import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import Link from "next/link";
import { ReceiptsListClient } from "./receipts-list-client";

export default async function ReceiptsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) redirect("/app/setup");
  const canWrite = active.role === "ADMIN" || active.role === "APPROVER" || active.role === "STAFF";
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Goods Receipts</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Record receipts against purchase orders. Submit receipts to update PO status and enable 3-way matching.
      </p>
      <ReceiptsListClient orgId={active.id} canWrite={canWrite} />
    </div>
  );
}
