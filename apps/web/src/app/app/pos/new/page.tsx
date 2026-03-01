import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import Link from "next/link";
import { NewPOClient } from "./new-po-client";

export default async function NewPOPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) redirect("/app/setup");
  const canWrite = active.role === "ADMIN" || active.role === "APPROVER" || active.role === "STAFF";
  if (!canWrite) redirect("/app/pos");
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">New Purchase Order</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Create a draft PO. After saving, use Issue to make it active for receipts.
      </p>
      <NewPOClient orgId={active.id} />
    </div>
  );
}
