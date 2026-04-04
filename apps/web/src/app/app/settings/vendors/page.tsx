import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import Link from "next/link";
import { VendorsClient } from "./vendors-client";

export default async function VendorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  if (!activeOrg) {
    return (
      <div>
        <p className="text-slate-600">Create an organization first.</p>
        <Link href="/app/setup" className="mt-2 inline-block text-sm font-medium text-slate-900 hover:underline">Go to Setup</Link>
      </div>
    );
  }
  const isAdmin = activeWithRole?.role === "ADMIN";
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Vendor directory</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Manage vendors. Only active vendors can be used on requests and paid. Admin: add and edit.
        <Link href="/app/vendors" className="ml-2 text-slate-900 underline hover:no-underline dark:text-slate-100">
          Go to Vendors 360 →
        </Link>
      </p>
      <VendorsClient orgId={activeOrg.id} isAdmin={isAdmin} />
    </div>
  );
}
