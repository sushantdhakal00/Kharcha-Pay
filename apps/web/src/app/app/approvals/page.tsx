import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";

/** Approvals is a shortcut to Requests filtered for PENDING + not mine (approvals queue) */
export default async function ApprovalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) redirect("/app/setup");
  redirect("/app/requests?status=PENDING&mine=0");
}
