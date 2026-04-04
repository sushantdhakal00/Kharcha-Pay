import { prisma } from "@/lib/db";
import {
  computeAccountBalances,
  flattenBalances,
  type LedgerEntryLike,
} from "@/lib/fiat/treasury-balances";
import {
  reconcileBalances,
  maxSeverity,
  serializeResultsForJson,
  reconciliationDriftDedupKey,
  NoopProviderAdapter,
  NoopOnChainAdapter,
  type ObservedBalanceAdapter,
  type ReconciliationResult,
  type ReconciliationSeverityLevel,
} from "@/lib/fiat/treasury-reconciliation";
import { emitTreasuryEvent } from "@/lib/fiat/treasury-events";

export interface ReconcileOrgResult {
  orgId: string;
  maxSeverity: ReconciliationSeverityLevel;
  resultCount: number;
  driftCount: number;
}

export async function reconcileOrgBalances(
  orgId: string,
  adapters: ObservedBalanceAdapter[] = [],
  asOf: Date = new Date()
): Promise<{
  results: ReconciliationResult[];
  maxSev: ReconciliationSeverityLevel;
}> {
  const entries = await prisma.treasuryLedgerEntry.findMany({
    where: { orgId, createdAt: { lte: asOf } },
    select: {
      account: true,
      direction: true,
      amountMinor: true,
      currency: true,
      createdAt: true,
    },
  });

  const balances = computeAccountBalances(entries as LedgerEntryLike[]);
  const expectedFlat = flattenBalances(balances);

  const allObserved = [];
  for (const adapter of adapters) {
    try {
      const obs = await adapter.fetchObservedBalances(orgId);
      allObserved.push(...obs);
    } catch {
      /* adapter failure is non-fatal */
    }
  }

  const results = reconcileBalances(orgId, expectedFlat, allObserved);
  const maxSev = maxSeverity(results);

  return { results, maxSev };
}

export async function runReconciliationForOrg(
  orgId: string,
  asOf: Date = new Date()
): Promise<ReconcileOrgResult> {
  const adapters: ObservedBalanceAdapter[] = [
    new NoopProviderAdapter(),
    new NoopOnChainAdapter(),
  ];

  const { results, maxSev } = await reconcileOrgBalances(orgId, adapters, asOf);

  const driftResults = results.filter((r) => r.severity !== "INFO");

  if (results.length > 0) {
    try {
      await prisma.treasuryReconciliationCheck.create({
        data: {
          orgId,
          asOf,
          results: serializeResultsForJson(results) as any,
          maxSeverity: maxSev as any,
        },
      });
    } catch (e: unknown) {
      const pe = e as { code?: string };
      if (pe.code !== "P2002") throw e;
    }
  }

  for (const dr of driftResults) {
    await emitTreasuryEvent({
      orgId,
      type: "RECONCILIATION_DRIFT_DETECTED" as any,
      entityType: "TreasuryReconciliationCheck",
      entityId: orgId,
      dedupKey: reconciliationDriftDedupKey(orgId, dr.account, dr.currency),
      payload: {
        account: dr.account,
        currency: dr.currency,
        source: dr.source,
        expectedMinor: dr.expectedMinor.toString(),
        observedMinor: dr.observedMinor.toString(),
        deltaMinor: dr.deltaMinor.toString(),
        severity: dr.severity,
        reason: dr.reason,
      },
    }).catch(() => {});
  }

  return {
    orgId,
    maxSeverity: maxSev,
    resultCount: results.length,
    driftCount: driftResults.length,
  };
}

export async function runReconciliationAllOrgs(
  asOf: Date = new Date()
): Promise<ReconcileOrgResult[]> {
  const orgs = await prisma.treasuryLedgerEntry.findMany({
    select: { orgId: true },
    distinct: ["orgId"],
  });

  const results: ReconcileOrgResult[] = [];
  for (const { orgId } of orgs) {
    const result = await runReconciliationForOrg(orgId, asOf);
    results.push(result);
  }
  return results;
}
