import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser } from "@/lib/get-active-org";

export default async function AppPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const activeOrg = await getActiveOrgForUser(user);
  if (activeOrg) redirect("/app/dashboard");

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      Create or join an organization in Setup to see the dashboard.
    </div>
  );
}
