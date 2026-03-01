import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { AuditRetentionClient } from "./audit-retention-client";

export default async function AuditRetentionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  const isAdmin = activeWithRole?.role === "ADMIN";
  if (!activeOrg || !isAdmin) {
    return (
      <div>
        <p className="text-slate-600">Admin access required to manage audit retention.</p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Audit retention</h1>
      <p className="mt-1 text-sm text-slate-600">
        Set how long to keep audit events. Run cleanup manually to delete events older than the retention period.
      </p>
      <AuditRetentionClient orgId={activeOrg.id} />
    </div>
  );
}
