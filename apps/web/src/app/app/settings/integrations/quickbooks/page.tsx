import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { QuickBooksClient } from "./quickbooks-client";

export default async function QuickBooksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  const isAdmin = activeWithRole?.role === "ADMIN";
  if (!activeOrg || !isAdmin) {
    return (
      <div>
        <p className="text-slate-600 dark:text-slate-400">Admin access required.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-4">
        <Link href="/app/settings/integrations" className="text-sm text-slate-600 hover:underline dark:text-slate-400">
          ← Integrations
        </Link>
      </div>
      <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">QuickBooks Online</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Connect QuickBooks to sync Chart of Accounts and export bills and payments.
      </p>
      <QuickBooksClient orgId={activeOrg.id} />
    </div>
  );
}
