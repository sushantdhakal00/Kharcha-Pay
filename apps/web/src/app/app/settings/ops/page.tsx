import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { OpsClient } from "./ops-client";

export default async function OpsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  const isAdmin = activeWithRole?.role === "ADMIN";
  if (!activeOrg || !isAdmin) {
    return (
      <div>
        <p className="text-slate-600">Admin access required for ops settings.</p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Ops</h1>
      <p className="mt-1 text-sm text-slate-600">
        Deployment and operations checks for this environment.
      </p>
      <OpsClient orgId={activeOrg.id} />
    </div>
  );
}
