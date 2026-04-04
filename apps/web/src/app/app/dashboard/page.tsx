import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";

export default async function DashboardRouterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const activeOrg = await getActiveOrgForUser(user);
  if (!activeOrg) redirect("/app/setup");

  const activeWithRole = await getActiveOrgWithRole(user);
  if (!activeWithRole) redirect("/app/setup");

  const role = activeWithRole.role;
  if (role === "ADMIN") redirect("/app/dashboard/admin");
  if (role === "APPROVER") redirect("/app/dashboard/approver");
  if (role === "STAFF") redirect("/app/dashboard/staff");
  if (role === "AUDITOR") redirect("/app/dashboard/auditor");

  redirect("/app/dashboard/admin");
}
