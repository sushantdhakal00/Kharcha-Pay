import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { IntegrationsClient } from "./integrations-client";

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  const isAdmin = activeWithRole?.role === "ADMIN";
  if (!activeOrg || !isAdmin) {
    return (
      <div>
        <p className="text-slate-600">Admin access required to manage integrations.</p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Integrations</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Webhooks send events to your endpoints. Configure URLs, secrets, and event subscriptions.
      </p>
      <IntegrationsClient orgId={activeOrg.id} />
    </div>
  );
}
