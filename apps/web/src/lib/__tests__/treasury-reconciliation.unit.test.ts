import { describe, it, expect } from "vitest";
import {
  computeReconciliationSeverity,
  reconcileBalances,
  maxSeverity,
  reconciliationDriftDedupKey,
  serializeResultsForJson,
  NoopProviderAdapter,
  NoopOnChainAdapter,
  type ReconciliationResult,
  type ObservedBalance,
} from "../fiat/treasury-reconciliation";

describe("Treasury Reconciliation", () => {
  describe("computeReconciliationSeverity", () => {
    it("returns INFO when delta is zero", () => {
      expect(computeReconciliationSeverity(0n, 10000n)).toBe("INFO");
    });

    it("returns WARN for small absolute delta ($5 or less)", () => {
      expect(computeReconciliationSeverity(100n, 100000n)).toBe("WARN");
      expect(computeReconciliationSeverity(-200n, 100000n)).toBe("WARN");
      expect(computeReconciliationSeverity(500n, 100000n)).toBe("WARN");
    });

    it("returns WARN for delta within 1% of expected", () => {
      expect(computeReconciliationSeverity(900n, 100000n)).toBe("WARN");
      expect(computeReconciliationSeverity(1000n, 100000n)).toBe("WARN");
    });

    it("returns CRITICAL for delta exceeding thresholds", () => {
      expect(computeReconciliationSeverity(5000n, 10000n)).toBe("CRITICAL");
      expect(computeReconciliationSeverity(-20000n, 100000n)).toBe("CRITICAL");
    });

    it("returns WARN for negative delta within threshold", () => {
      expect(computeReconciliationSeverity(-300n, 100000n)).toBe("WARN");
    });

    it("handles zero expected with non-zero delta as CRITICAL", () => {
      expect(computeReconciliationSeverity(1000n, 0n)).toBe("CRITICAL");
    });

    it("handles negative expected", () => {
      expect(computeReconciliationSeverity(100n, -50000n)).toBe("WARN");
    });
  });

  describe("reconcileBalances", () => {
    it("produces results for matching observed balances", () => {
      const expected = [
        { account: "TREASURY_WALLET", currency: "USD", balanceMinor: 10000n },
      ];
      const observed: ObservedBalance[] = [
        {
          account: "TREASURY_WALLET",
          currency: "USD",
          source: "PROVIDER",
          balanceMinor: 10000n,
        },
      ];
      const results = reconcileBalances("org1", expected, observed);
      expect(results).toHaveLength(1);
      expect(results[0].deltaMinor).toBe(0n);
      expect(results[0].severity).toBe("INFO");
    });

    it("detects drift when balances differ", () => {
      const expected = [
        { account: "PROVIDER_WALLET", currency: "USD", balanceMinor: 10000n },
      ];
      const observed: ObservedBalance[] = [
        {
          account: "PROVIDER_WALLET",
          currency: "USD",
          source: "PROVIDER",
          balanceMinor: 5000n,
        },
      ];
      const results = reconcileBalances("org1", expected, observed);
      expect(results).toHaveLength(1);
      expect(results[0].deltaMinor).toBe(-5000n);
      expect(results[0].severity).toBe("CRITICAL");
    });

    it("produces no results when no observed data", () => {
      const expected = [
        { account: "CLEARING", currency: "USD", balanceMinor: 1000n },
      ];
      const results = reconcileBalances("org1", expected, []);
      expect(results).toHaveLength(0);
    });

    it("handles multiple accounts and sources", () => {
      const expected = [
        { account: "TREASURY_WALLET", currency: "USD", balanceMinor: 50000n },
        { account: "PROVIDER_WALLET", currency: "USD", balanceMinor: 20000n },
      ];
      const observed: ObservedBalance[] = [
        {
          account: "TREASURY_WALLET",
          currency: "USD",
          source: "ONCHAIN",
          balanceMinor: 50000n,
        },
        {
          account: "PROVIDER_WALLET",
          currency: "USD",
          source: "PROVIDER",
          balanceMinor: 19000n,
        },
      ];
      const results = reconcileBalances("org1", expected, observed);
      expect(results).toHaveLength(2);
      expect(results[0].severity).toBe("INFO");
      expect(results[1].severity).toBe("CRITICAL");
    });

    it("includes orgId in results", () => {
      const results = reconcileBalances(
        "test-org",
        [{ account: "CLEARING", currency: "USD", balanceMinor: 0n }],
        [
          {
            account: "CLEARING",
            currency: "USD",
            source: "PROVIDER",
            balanceMinor: 0n,
          },
        ]
      );
      expect(results[0].orgId).toBe("test-org");
    });

    it("generates meaningful reason for drift", () => {
      const results = reconcileBalances(
        "org1",
        [{ account: "CLEARING", currency: "USD", balanceMinor: 10000n }],
        [
          {
            account: "CLEARING",
            currency: "USD",
            source: "PROVIDER",
            balanceMinor: 12000n,
          },
        ]
      );
      expect(results[0].reason).toContain("over");
      expect(results[0].reason).toContain("PROVIDER");
    });

    it("generates reason for under-balance", () => {
      const results = reconcileBalances(
        "org1",
        [{ account: "CLEARING", currency: "USD", balanceMinor: 10000n }],
        [
          {
            account: "CLEARING",
            currency: "USD",
            source: "ONCHAIN",
            balanceMinor: 5000n,
          },
        ]
      );
      expect(results[0].reason).toContain("under");
    });
  });

  describe("maxSeverity", () => {
    it("returns INFO for empty results", () => {
      expect(maxSeverity([])).toBe("INFO");
    });

    it("returns highest severity", () => {
      const results = [
        { severity: "INFO" },
        { severity: "WARN" },
        { severity: "CRITICAL" },
      ] as ReconciliationResult[];
      expect(maxSeverity(results)).toBe("CRITICAL");
    });

    it("returns WARN when no CRITICAL", () => {
      const results = [
        { severity: "INFO" },
        { severity: "WARN" },
      ] as ReconciliationResult[];
      expect(maxSeverity(results)).toBe("WARN");
    });

    it("returns INFO when all INFO", () => {
      const results = [
        { severity: "INFO" },
        { severity: "INFO" },
      ] as ReconciliationResult[];
      expect(maxSeverity(results)).toBe("INFO");
    });
  });

  describe("reconciliationDriftDedupKey", () => {
    it("includes orgId, account, currency, and date", () => {
      const key = reconciliationDriftDedupKey("org1", "CLEARING", "USD");
      expect(key).toContain("org1");
      expect(key).toContain("CLEARING");
      expect(key).toContain("USD");
      expect(key).toContain("recon-drift");
    });

    it("produces same key within same day", () => {
      const k1 = reconciliationDriftDedupKey("org1", "CLEARING", "USD");
      const k2 = reconciliationDriftDedupKey("org1", "CLEARING", "USD");
      expect(k1).toBe(k2);
    });

    it("produces different keys for different accounts", () => {
      const k1 = reconciliationDriftDedupKey("org1", "CLEARING", "USD");
      const k2 = reconciliationDriftDedupKey("org1", "VENDOR_PAYABLE", "USD");
      expect(k1).not.toBe(k2);
    });
  });

  describe("serializeResultsForJson", () => {
    it("converts BigInt to string", () => {
      const results: ReconciliationResult[] = [
        {
          orgId: "org1",
          account: "CLEARING",
          currency: "USD",
          source: "PROVIDER",
          expectedMinor: 10000n,
          observedMinor: 10000n,
          deltaMinor: 0n,
          severity: "INFO",
          reason: "Match",
        },
      ];
      const serialized = serializeResultsForJson(results);
      expect(typeof serialized[0].expectedMinor).toBe("string");
      expect(typeof serialized[0].observedMinor).toBe("string");
      expect(typeof serialized[0].deltaMinor).toBe("string");
    });

    it("preserves all fields", () => {
      const results: ReconciliationResult[] = [
        {
          orgId: "org1",
          account: "CLEARING",
          currency: "EUR",
          source: "ONCHAIN",
          expectedMinor: 5000n,
          observedMinor: 4000n,
          deltaMinor: -1000n,
          severity: "CRITICAL",
          reason: "under",
        },
      ];
      const s = serializeResultsForJson(results);
      expect(s[0].orgId).toBe("org1");
      expect(s[0].account).toBe("CLEARING");
      expect(s[0].currency).toBe("EUR");
      expect(s[0].source).toBe("ONCHAIN");
      expect(s[0].severity).toBe("CRITICAL");
    });
  });

  describe("Noop adapters", () => {
    it("NoopProviderAdapter returns empty array", async () => {
      const adapter = new NoopProviderAdapter();
      expect(adapter.name).toBe("noop-provider");
      const result = await adapter.fetchObservedBalances("org1");
      expect(result).toEqual([]);
    });

    it("NoopOnChainAdapter returns empty array", async () => {
      const adapter = new NoopOnChainAdapter();
      expect(adapter.name).toBe("noop-onchain");
      const result = await adapter.fetchObservedBalances("org1");
      expect(result).toEqual([]);
    });
  });
});
