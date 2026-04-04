import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import { NewInvoiceClient } from "./new-invoice-client";

export default async function NewInvoicePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) redirect("/app/setup");
  const canWrite = active.role === "ADMIN" || active.role === "APPROVER" || active.role === "STAFF";
  if (!canWrite) redirect("/app/invoices");
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">New invoice</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Create a draft invoice. For PO invoices, link to a PO and enter line items. Non-PO invoices require manual verification.
      </p>
      <NewInvoiceClient orgId={active.id} />
    </div>
  );
}
