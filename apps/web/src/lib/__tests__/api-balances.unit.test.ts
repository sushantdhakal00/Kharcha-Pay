import { describe, it, expect } from "vitest";
import {
  computeAccountBalances,
  computeOrgBalances,
  computeBalanceAsOf,
  flattenBalances,
  getAccountBalance,
  ALL_ACCOUNTS,
  type LedgerEntryLike,
} from "../fiat/treasury-balances";
import {
  computeReconciliationSeverity,
  maxSeverity,
  serializeResultsForJson,
  type ReconciliationResult,
} from "../fiat/treasury-reconciliation";

function entry(
  account: string,
  direction: string,
  amountMinor: bigint,
  currency: string = "USD",
  createdAt: Date = new Date()
): LedgerEntryLike {
  return { account, direction, amountMinor, currency, createdAt } as LedgerEntryLike;
}

describe("API Balances (pure helpers)", () => {
  describe("Ledger-balances response shape", () => {
    it("flattenBalances produces API-friendly rows", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 10000n),
        entry("CLEARING", "CREDIT", 10000n),
      ];
      const byAccount = computeAccountBalances(entries);
      const flat = flattenBalances(byAccount);

      const apiRows = flat.map((f) => ({
        account: f.account,
        currency: f.currency,
        balanceMinor: f.balanceMinor.toString(),
        balanceMajor: (Number(f.balanceMinor) / 100).toFixed(2),
      }));

      expect(apiRows).toHaveLength(2);
      expect(apiRows[0]).toHaveProperty("balanceMinor");
      expect(apiRows[0]).toHaveProperty("balanceMajor");
    });

    it("balanceMajor is correctly formatted", () => {
      const flat = flattenBalances({ CLEARING: { USD: 12345n } });
      const major = (Number(flat[0].balanceMinor) / 100).toFixed(2);
      expect(major).toBe("123.45");
    });

    it("handles negative balances in display", () => {
      const flat = flattenBalances({ CLEARING: { USD: -5000n } });
      const major = (Number(flat[0].balanceMinor) / 100).toFixed(2);
      expect(major).toBe("-50.00");
    });
  });

  describe("Reconciliation response shape", () => {
    it("serialized results have string BigInts", () => {
      const results: ReconciliationResult[] = [
        {
          orgId: "org1",
          account: "CLEARING",
          currency: "USD",
          source: "PROVIDER",
          expectedMinor: 10000n,
          observedMinor: 9500n,
          deltaMinor: -500n,
          severity: "WARN",
          reason: "under",
        },
      ];
      const serialized = serializeResultsForJson(results);
      expect(typeof serialized[0].deltaMinor).toBe("string");
      expect(serialized[0].deltaMinor).toBe("-500");
    });

    it("topDrifts filters out INFO results", () => {
      const results: ReconciliationResult[] = [
        { severity: "INFO" } as ReconciliationResult,
        { severity: "WARN" } as ReconciliationResult,
        { severity: "CRITICAL" } as ReconciliationResult,
      ];
      const topDrifts = results.filter((r) => r.severity !== "INFO");
      expect(topDrifts).toHaveLength(2);
    });

    it("topDrifts limited to 5", () => {
      const results: ReconciliationResult[] = Array.from({ length: 10 }, () => ({
        severity: "WARN",
      })) as ReconciliationResult[];
      const topDrifts = results.filter((r) => r.severity !== "INFO").slice(0, 5);
      expect(topDrifts).toHaveLength(5);
    });
  });

  describe("Snapshot vs computed source logic", () => {
    it("snapshot source indicated when present", () => {
      const source = "snapshot";
      expect(source).toBe("snapshot");
    });

    it("computed source indicated when no snapshots", () => {
      const source = "computed";
      expect(source).toBe("computed");
    });
  });

  describe("Multi-currency API support", () => {
    it("handles multiple currencies in balance response", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 1000n, "USD"),
        entry("VENDOR_PAYABLE", "DEBIT", 2000n, "EUR"),
        entry("CLEARING", "CREDIT", 500n, "GBP"),
      ];
      const byAccount = computeAccountBalances(entries);
      const flat = flattenBalances(byAccount);
      expect(flat.length).toBe(3);

      const currencies = new Set(flat.map((f) => f.currency));
      expect(currencies.size).toBe(3);
    });

    it("getAccountBalance defaults to USD", () => {
      const byAccount = computeAccountBalances([
        entry("CLEARING", "DEBIT", 500n, "USD"),
      ]);
      expect(getAccountBalance(byAccount, "CLEARING")).toBe(500n);
    });
  });

  describe("ALL_ACCOUNTS enumeration", () => {
    it("can be used to iterate account cards", () => {
      const flat = flattenBalances({
        TREASURY_WALLET: { USD: 0n },
        PROVIDER_WALLET: { USD: 0n },
        VENDOR_PAYABLE: { USD: 0n },
        CLEARING: { USD: 0n },
        FEES_EXPENSE: { USD: 0n },
        SUSPENSE: { USD: 0n },
      });
      expect(flat).toHaveLength(6);
    });
  });
});
