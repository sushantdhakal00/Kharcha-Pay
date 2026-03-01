import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const activeOrg = await getActiveOrgForUser(user);
  if (!activeOrg) redirect("/app/setup");

  const activeWithRole = await getActiveOrgWithRole(user);
  if (!activeWithRole) redirect("/app/setup");

  return <>{children}</>;
}
