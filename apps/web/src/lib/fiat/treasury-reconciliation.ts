import { TreasuryLedgerAccount } from "@prisma/client";

export type ObservedBalanceSource = "LEDGER" | "PROVIDER" | "ONCHAIN";

export type ReconciliationSeverityLevel = "INFO" | "WARN" | "CRITICAL";

export interface ReconciliationResult {
  orgId: string;
  account: string;
  currency: string;
  source: ObservedBalanceSource;
  expectedMinor: bigint;
  observedMinor: bigint;
  deltaMinor: bigint;
  severity: ReconciliationSeverityLevel;
  reason: string;
}

const SMALL_ABSOLUTE_THRESHOLD = BigInt(500); // $5.00 in minor units
const WARN_PERCENT_THRESHOLD = 1; // 1%

export function computeReconciliationSeverity(
  deltaMinor: bigint,
  expectedMinor: bigint
): ReconciliationSeverityLevel {
  const absDelta = deltaMinor < BigInt(0) ? -deltaMinor : deltaMinor;

  if (absDelta === BigInt(0)) return "INFO";

  if (absDelta <= SMALL_ABSOLUTE_THRESHOLD) return "WARN";

  if (expectedMinor !== BigInt(0)) {
    const pct = Number(absDelta * BigInt(100)) / Number(expectedMinor < BigInt(0) ? -expectedMinor : expectedMinor);
    if (pct <= WARN_PERCENT_THRESHOLD) return "WARN";
  }

  return "CRITICAL";
}

export function maxSeverity(
  results: ReconciliationResult[]
): ReconciliationSeverityLevel {
  const order: ReconciliationSeverityLevel[] = ["INFO", "WARN", "CRITICAL"];
  let max: ReconciliationSeverityLevel = "INFO";
  for (const r of results) {
    if (order.indexOf(r.severity) > order.indexOf(max)) {
      max = r.severity;
    }
  }
  return max;
}

export interface ObservedBalance {
  account: string;
  currency: string;
  source: ObservedBalanceSource;
  balanceMinor: bigint;
}

export interface ObservedBalanceAdapter {
  readonly name: string;
  fetchObservedBalances(orgId: string): Promise<ObservedBalance[]>;
}

export class NoopProviderAdapter implements ObservedBalanceAdapter {
  readonly name = "noop-provider";
  async fetchObservedBalances(_orgId: string): Promise<ObservedBalance[]> {
    return [];
  }
}

export class NoopOnChainAdapter implements ObservedBalanceAdapter {
  readonly name = "noop-onchain";
  async fetchObservedBalances(_orgId: string): Promise<ObservedBalance[]> {
    return [];
  }
}

export function reconcileBalances(
  orgId: string,
  expectedBalances: Array<{ account: string; currency: string; balanceMinor: bigint }>,
  observedBalances: ObservedBalance[]
): ReconciliationResult[] {
  const results: ReconciliationResult[] = [];

  const observedMap = new Map<string, ObservedBalance>();
  for (const ob of observedBalances) {
    observedMap.set(`${ob.account}:${ob.currency}:${ob.source}`, ob);
  }

  for (const exp of expectedBalances) {
    const sources: ObservedBalanceSource[] = ["PROVIDER", "ONCHAIN"];
    for (const source of sources) {
      const key = `${exp.account}:${exp.currency}:${source}`;
      const obs = observedMap.get(key);
      if (!obs) continue;

      const delta = obs.balanceMinor - exp.balanceMinor;
      const severity = computeReconciliationSeverity(delta, exp.balanceMinor);
      const absDelta = delta < BigInt(0) ? -delta : delta;

      let reason = "Balances match";
      if (delta !== BigInt(0)) {
        const direction = delta > BigInt(0) ? "over" : "under";
        reason = `${source} balance is ${direction} by ${absDelta} minor units for ${exp.account}/${exp.currency}`;
      }

      results.push({
        orgId,
        account: exp.account,
        currency: exp.currency,
        source,
        expectedMinor: exp.balanceMinor,
        observedMinor: obs.balanceMinor,
        deltaMinor: delta,
        severity,
        reason,
      });
    }
  }

  return results;
}

export function reconciliationDriftDedupKey(
  orgId: string,
  account: string,
  currency: string
): string {
  const dayStr = new Date().toISOString().slice(0, 10);
  return `recon-drift:${orgId}:${account}:${currency}:${dayStr}`;
}

export function serializeResultsForJson(
  results: ReconciliationResult[]
): Record<string, unknown>[] {
  return results.map((r) => ({
    orgId: r.orgId,
    account: r.account,
    currency: r.currency,
    source: r.source,
    expectedMinor: r.expectedMinor.toString(),
    observedMinor: r.observedMinor.toString(),
    deltaMinor: r.deltaMinor.toString(),
    severity: r.severity,
    reason: r.reason,
  }));
}
