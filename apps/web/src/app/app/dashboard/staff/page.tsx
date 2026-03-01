import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { prisma } from "@/lib/db";
import { StaffDashboardClient } from "./staff-dashboard-client";

export default async function StaffDashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  if (!activeOrg || !activeWithRole || activeWithRole.role !== "STAFF") {
    return null;
  }

  const org = await prisma.organization.findUnique({
    where: { id: activeOrg.id },
    select: { currency: true },
  });

  return (
    <StaffDashboardClient
      orgId={activeOrg.id}
      orgName={activeOrg.name}
      currency={org?.currency ?? "USD"}
      userId={user.id}
    />
  );
}
