import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import { NewReceiptClient } from "./new-receipt-client";

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<{ poId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) redirect("/app/setup");
  const { poId } = await searchParams;
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Record goods receipt</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Enter quantities received for each PO line. Submit to update PO status.
      </p>
      <NewReceiptClient orgId={active.id} defaultPoId={poId ?? ""} />
    </div>
  );
}
