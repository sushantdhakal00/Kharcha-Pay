import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import Link from "next/link";
import { ConfidentialDemoClient } from "./confidential-demo-client";

export default async function ConfidentialDemoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) {
    return (
      <div>
        <p className="text-slate-600">Create an organization first.</p>
        <Link href="/app/setup" className="mt-2 inline-block text-sm font-medium text-slate-900 hover:underline">Go to Setup</Link>
      </div>
    );
  }
  if (active.role !== "ADMIN") {
    return (
      <div>
        <p className="text-slate-600">This page is for org admins only.</p>
        <Link href="/app" className="mt-2 inline-block text-sm font-medium text-slate-900 hover:underline">Dashboard</Link>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Confidential Transfer playground</h1>
      <p className="mt-1 text-sm text-slate-600">
        Devnet demo only. Run the canonical CT flow: create mint → accounts → mint → deposit → apply pending → transfer → apply pending (vendor) → withdraw.
      </p>
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Warning:</strong> Devnet demo only; amounts in minor units; addresses are public. Confidential Transfer extension is currently disabled on devnet (Solana ZK audit); deposit/apply/transfer/withdraw will return a message until re-enabled.
      </div>
      <ConfidentialDemoClient orgId={active.id} />
    </div>
  );
}
