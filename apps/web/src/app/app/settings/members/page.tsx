import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser } from "@/lib/get-active-org";
import Link from "next/link";
import { MembersClient } from "./members-client";

export default async function MembersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const activeOrg = await getActiveOrgForUser(user);
  if (!activeOrg) {
    return (
      <div>
        <p className="text-slate-600">Create an organization first.</p>
        <Link href="/app/setup" className="mt-2 inline-block text-sm font-medium text-slate-900 hover:underline">Go to Setup</Link>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Members</h1>
      <p className="mt-1 text-sm text-slate-600">Invite members by email (user must already exist). Admin only.</p>
      <MembersClient orgId={activeOrg.id} />
    </div>
  );
}
