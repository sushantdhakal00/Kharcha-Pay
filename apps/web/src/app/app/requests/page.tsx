import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import Link from "next/link";
import { RequestsListClient } from "./requests-list-client";

export default async function RequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) {
    return (
      <div>
        <p className="text-slate-600">Create an organization first.</p>
        <Link href="/app/setup" className="mt-2 inline-block text-sm font-medium text-slate-900 hover:underline">
          Go to Setup
        </Link>
      </div>
    );
  }

  const canApprove = active.role === "ADMIN" || active.role === "APPROVER";
  const isAuditor = active.role === "AUDITOR";
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Requests</h1>
        {!isAuditor && (
          <Link href="/app/requests/new" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            New request
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {isAuditor ? "Read-only view of expense requests." : canApprove ? "View your requests or all pending for approval." : "View your expense requests."}
      </p>
      <RequestsListClient orgId={active.id} canApprove={canApprove} readOnly={isAuditor} />
    </div>
  );
}
