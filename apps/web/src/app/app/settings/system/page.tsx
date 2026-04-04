import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { SystemStatusClient } from "./system-status-client";
import { TreasuryWalletClient } from "./treasury-wallet-client";
import { TreasuryPayoutsClient } from "./treasury-payouts-client";
import { TreasuryInsightsClient } from "./treasury-insights-client";
import { TreasuryLedgerClient } from "./treasury-ledger-client";
import { TreasuryLiveContainer } from "./treasury-live-container";
import { TreasuryPolicyClient } from "./treasury-policy-client";
import { TreasuryBalancesClient } from "./treasury-balances-client";
import { TreasuryWalletsMintsClient } from "./treasury-wallets-mints-client";
import { TreasuryControlCenterClient } from "./treasury-control-center-client";
import { TreasuryStatusIndicator } from "@/components/treasury-status-banner";

export default async function SystemStatusPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  const isAdmin = activeWithRole?.role === "ADMIN";
  if (!activeOrg || !isAdmin) {
    return (
      <div>
        <p className="text-slate-600">Admin access required for System Status.</p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
        System Status <TreasuryStatusIndicator />
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Treasury (Circle integration, balances, payouts, wallets, mints, ledger), Control Center, DB, Redis, Cron, Outbox, Webhooks, QBO. Refresh to update.
      </p>
      <SystemStatusClient orgId={activeOrg.id} />
      <TreasuryControlCenterClient orgId={activeOrg.id} />
      <TreasuryLiveContainer orgId={activeOrg.id} />
      <TreasuryInsightsClient orgId={activeOrg.id} />
      <TreasuryWalletClient orgId={activeOrg.id} />
      <TreasuryPolicyClient orgId={activeOrg.id} />
      <TreasuryWalletsMintsClient orgId={activeOrg.id} />
      <TreasuryPayoutsClient orgId={activeOrg.id} />
      <TreasuryBalancesClient orgId={activeOrg.id} />
      <TreasuryLedgerClient orgId={activeOrg.id} />
    </div>
  );
}
