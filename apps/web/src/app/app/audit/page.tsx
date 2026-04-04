import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { AuditClient } from "./audit-client";

export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  const isAdmin = activeWithRole?.role === "ADMIN";

  return (
    <div className="space-y-6">
      {activeOrg ? (
        <AuditClient orgId={activeOrg.id} isAdmin={isAdmin} />
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Create or join an organization in Setup to view the audit log.
        </div>
      )}
    </div>
  );
}
