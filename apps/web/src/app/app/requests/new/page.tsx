import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser } from "@/lib/get-active-org";
import Link from "next/link";
import { NewRequestClient } from "./new-request-client";

export default async function NewRequestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const activeOrg = await getActiveOrgForUser(user);
  if (!activeOrg) {
    return (
      <div>
        <p className="text-slate-600">Create an organization first.</p>
        <Link href="/app/setup" className="mt-2 inline-block text-sm font-medium text-slate-900 hover:underline">
          Go to Setup
        </Link>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">New expense request</h1>
      <p className="mt-1 text-sm text-slate-600">Create a draft request. You can add a receipt and submit from the detail page.</p>
      <NewRequestClient orgId={activeOrg.id} />
    </div>
  );
}
