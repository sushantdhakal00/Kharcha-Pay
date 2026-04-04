import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { PaymentsClient } from "./payments-client";

export default async function PaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  const isAdmin = activeWithRole?.role === "ADMIN";

  if (!activeOrg) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Create or join an organization to view payments.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Payments</h1>
      <p className="text-sm text-slate-600">
        Paid requests with on-chain transaction signature and memo. Export CSV for reconciliation.
      </p>
      <PaymentsClient orgId={activeOrg.id} isAdmin={isAdmin} />
    </div>
  );
}
