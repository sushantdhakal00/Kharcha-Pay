import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  const isAdmin = activeWithRole?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Reports & exports</h1>
      <p className="text-sm text-slate-600">
        Export data as CSV for budgeting, reconciliation, and audit. Any org member can export budgets, requests, and payments. Audit export is ADMIN only.
      </p>
      {activeOrg ? (
        <ReportsClient orgId={activeOrg.id} isAdmin={isAdmin} />
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Create or join an organization in Setup to access reports.
        </div>
      )}
    </div>
  );
}
