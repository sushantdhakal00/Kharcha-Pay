import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import Link from "next/link";
import { InvoicesListClient } from "./invoices-list-client";

export default async function InvoicesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) redirect("/app/setup");
  const canWrite = active.role === "ADMIN" || active.role === "APPROVER" || active.role === "STAFF";
  const canVerify = active.role === "ADMIN" || active.role === "APPROVER";
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Invoices</h1>
        {canWrite && (
          <Link
            href="/app/invoices/new"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            New invoice
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Create and submit invoices. Approvers verify and resolve match exceptions.
      </p>
      <InvoicesListClient orgId={active.id} canWrite={canWrite} canVerify={canVerify} />
    </div>
  );
}
