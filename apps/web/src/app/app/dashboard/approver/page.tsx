import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { prisma } from "@/lib/db";
import { ApproverDashboardClient } from "./approver-dashboard-client";

export default async function ApproverDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  if (!activeOrg || !activeWithRole || activeWithRole.role !== "APPROVER") {
    return null;
  }

  const org = await prisma.organization.findUnique({
    where: { id: activeOrg.id },
    select: { currency: true },
  });

  return (
    <ApproverDashboardClient
      orgId={activeOrg.id}
      orgName={activeOrg.name}
      currency={org?.currency ?? "USD"}
      userId={user.id}
    />
  );
}
