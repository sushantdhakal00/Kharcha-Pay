import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import Link from "next/link";
import { MatchingControlsClient } from "./matching-controls-client";

export default async function MatchingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) redirect("/app/setup");
  if (active.role !== "ADMIN") redirect("/app/dashboard");
  return (
    <div>
      <Link href="/app/setup" className="text-sm text-slate-600 hover:underline dark:text-slate-400">
        ← Back to setup
      </Link>
      <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
        Matching & Controls
      </h1>
      <MatchingControlsClient orgId={active.id} isAdmin={true} />
    </div>
  );
}
