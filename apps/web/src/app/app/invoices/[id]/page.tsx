import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import Link from "next/link";
import { InvoiceDetailClient } from "./invoice-detail-client";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) redirect("/app/setup");
  const { id } = await params;
  const canVerify = active.role === "ADMIN" || active.role === "APPROVER";
  const isAdmin = active.role === "ADMIN";
  return (
    <div>
      <Link href="/app/invoices" className="text-sm text-slate-600 hover:underline dark:text-slate-400">
        ← Back to invoices
      </Link>
      <InvoiceDetailClient orgId={active.id} invoiceId={id} canVerify={canVerify} isAdmin={isAdmin} />
    </div>
  );
}
