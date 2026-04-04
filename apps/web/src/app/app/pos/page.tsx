import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import Link from "next/link";
import { PurchaseOrdersListClient } from "./pos-list-client";

export default async function PurchaseOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) {
    return (
      <div>
        <p className="text-slate-600 dark:text-slate-300">Create an organization first.</p>
        <Link href="/app/setup" className="mt-2 inline-block text-sm font-medium text-slate-900 hover:underline dark:text-slate-100">Go to Setup</Link>
      </div>
    );
  }
  const canWrite = active.role === "ADMIN" || active.role === "APPROVER" || active.role === "STAFF";
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Purchase Orders</h1>
        {canWrite && (
          <Link href="/app/pos/new" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200">
            New PO
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Manage purchase orders. Issue draft POs to enable receipts and invoice matching.
      </p>
      <PurchaseOrdersListClient orgId={active.id} canWrite={canWrite} />
    </div>
  );
}
