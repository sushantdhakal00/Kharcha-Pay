import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { prisma } from "@/lib/db";

export default async function CompliancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  const isAuditor = activeWithRole?.role === "AUDITOR";

  if (!activeOrg) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Create or join an organization to view compliance.
      </div>
    );
  }

  const retention = await prisma.orgAuditRetention.findUnique({
    where: { orgId: activeOrg.id },
  });
  const retentionDays = retention?.retentionDays ?? 365;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Compliance & audit</h1>
      <p className="text-sm text-slate-600">
        On-chain transaction signatures and memos link every payment to an approved request for full auditability.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/app/payments"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 hover:bg-slate-50"
        >
          <h2 className="font-medium text-slate-900">Payments ledger</h2>
          <p className="mt-1 text-sm text-slate-600">View all paid requests with tx signature and explorer links.</p>
        </Link>
        <Link
          href="/app/audit"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 hover:bg-slate-50"
        >
          <h2 className="font-medium text-slate-900">Audit log</h2>
          <p className="mt-1 text-sm text-slate-600">Append-only log of key actions (approvals, payments, policy changes).</p>
        </Link>
        <Link
          href="/app/reports"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 hover:bg-slate-50"
        >
          <h2 className="font-medium text-slate-900">Reports</h2>
          <p className="mt-1 text-sm text-slate-600">Export requests, payments, budget vs actual, and audit as CSV.</p>
        </Link>
      </div>

      {isAuditor && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="font-medium text-slate-900">Audit retention</h2>
          <p className="mt-1 text-sm text-slate-600">
            Events are retained for <strong>{retentionDays} days</strong>. Cleanup is run by an administrator.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h2 className="font-medium text-slate-900">Confidential amounts</h2>
        <p className="mt-1 text-sm text-slate-600">
          Coming soon via Token-2022 Confidential Transfer auditor key. Until then, payment amounts are visible on-chain.
        </p>
      </div>
    </div>
  );
}
