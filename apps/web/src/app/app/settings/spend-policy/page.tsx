import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { SpendPolicyClient } from "./spend-policy-client";

export default async function SpendPolicyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  const isAdmin = activeWithRole?.role === "ADMIN";
  if (!activeOrg || !isAdmin) {
    return (
      <div>
        <p className="text-slate-600">Admin access required to manage spend policy.</p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Spend policy</h1>
      <p className="mt-1 text-sm text-slate-600">
        Guardrails enforced at payment time: receipt requirement, budget block, and optional admin override.
      </p>
      <SpendPolicyClient orgId={activeOrg.id} />
    </div>
  );
}
