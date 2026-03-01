import { describe, it, expect } from "vitest";
import {
  computeReconciliationSeverity,
  reconcileBalances,
  maxSeverity,
  NoopProviderAdapter,
  NoopOnChainAdapter,
  reconciliationDriftDedupKey,
  type ObservedBalance,
} from "../fiat/treasury-reconciliation";
import {
  computeAccountBalances,
  flattenBalances,
  type LedgerEntryLike,
} from "../fiat/treasury-balances";

function entry(
  account: string,
  direction: string,
  amountMinor: bigint,
  currency: string = "USD"
): LedgerEntryLike {
  return { account, direction, amountMinor, currency, createdAt: new Date() } as LedgerEntryLike;
}

describe("Reconcile Job (pure logic)", () => {
  describe("End-to-end reconciliation flow", () => {
    it("produces INFO when no observed data", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 10000n),
        entry("CLEARING", "CREDIT", 10000n),
      ];
      const balances = computeAccountBalances(entries);
      const flat = flattenBalances(balances);
      const results = reconcileBalances("org1", flat, []);
      expect(results).toHaveLength(0);
      expect(maxSeverity(results)).toBe("INFO");
    });

    it("detects drift when provider reports different balance", () => {
      const entries: LedgerEntryLike[] = [
        entry("PROVIDER_WALLET", "DEBIT", 50000n),
        entry("TREASURY_WALLET", "CREDIT", 50000n),
      ];
      const balances = computeAccountBalances(entries);
      const flat = flattenBalances(balances);

      const observed: ObservedBalance[] = [
        {
          account: "PROVIDER_WALLET",
          currency: "USD",
          source: "PROVIDER",
          balanceMinor: 40000n,
        },
      ];

      const results = reconcileBalances("org1", flat, observed);
      expect(results.length).toBeGreaterThan(0);
      const pw = results.find((r) => r.account === "PROVIDER_WALLET");
      expect(pw?.severity).toBe("CRITICAL");
      expect(pw?.deltaMinor).toBe(-10000n);
    });

    it("full lifecycle with matching balances returns INFO", () => {
      const entries: LedgerEntryLike[] = [
        entry("PROVIDER_WALLET", "DEBIT", 10000n),
      ];
      const balances = computeAccountBalances(entries);
      const flat = flattenBalances(balances);

      const observed: ObservedBalance[] = [
        {
          account: "PROVIDER_WALLET",
          currency: "USD",
          source: "PROVIDER",
          balanceMinor: 10000n,
        },
      ];

      const results = reconcileBalances("org1", flat, observed);
      expect(maxSeverity(results)).toBe("INFO");
    });
  });

  describe("Adapter composition", () => {
    it("NoopProviderAdapter can be used in adapter list", async () => {
      const adapter = new NoopProviderAdapter();
      const obs = await adapter.fetchObservedBalances("org1");
      expect(obs).toEqual([]);
    });

    it("NoopOnChainAdapter can be used in adapter list", async () => {
      const adapter = new NoopOnChainAdapter();
      const obs = await adapter.fetchObservedBalances("org1");
      expect(obs).toEqual([]);
    });

    it("multiple adapters can be composed", async () => {
      const adapters = [new NoopProviderAdapter(), new NoopOnChainAdapter()];
      const allObs = [];
      for (const a of adapters) {
        allObs.push(...(await a.fetchObservedBalances("org1")));
      }
      expect(allObs).toEqual([]);
    });
  });

  describe("Severity classification for job results", () => {
    it("maxSeverity picks CRITICAL over all", () => {
      const results = [
        { severity: "INFO" },
        { severity: "WARN" },
        { severity: "CRITICAL" },
      ] as any[];
      expect(maxSeverity(results)).toBe("CRITICAL");
    });

    it("WARN threshold: $5 exactly", () => {
      expect(computeReconciliationSeverity(500n, 1000000n)).toBe("WARN");
    });

    it("CRITICAL threshold: just above $5 and >1%", () => {
      expect(computeReconciliationSeverity(501n, 5000n)).toBe("CRITICAL");
    });
  });

  describe("Dedup key generation for drift events", () => {
    it("generates deterministic key", () => {
      const k1 = reconciliationDriftDedupKey("org1", "CLEARING", "USD");
      const k2 = reconciliationDriftDedupKey("org1", "CLEARING", "USD");
      expect(k1).toBe(k2);
    });

    it("different org produces different key", () => {
      const k1 = reconciliationDriftDedupKey("org1", "CLEARING", "USD");
      const k2 = reconciliationDriftDedupKey("org2", "CLEARING", "USD");
      expect(k1).not.toBe(k2);
    });
  });
});
