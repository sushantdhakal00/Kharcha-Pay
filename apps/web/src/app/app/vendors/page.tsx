import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import { VendorsListClient } from "./vendors-list-client";

export default async function VendorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) redirect("/app/setup");

  const isAdmin = active.role === "ADMIN";
  const isApprover = active.role === "ADMIN" || active.role === "APPROVER";
  const canWrite = active.role === "ADMIN" || active.role === "STAFF" || active.role === "APPROVER";

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Vendors</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Manage vendor master file, onboarding, payment methods, and compliance docs.
      </p>
      <VendorsListClient
        orgId={active.id}
        isAdmin={isAdmin}
        isApprover={isApprover}
        canWrite={canWrite}
      />
    </div>
  );
}
