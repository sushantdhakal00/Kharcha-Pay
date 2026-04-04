import { describe, it, expect } from "vitest";
import {
  applyLedgerEntry,
  computeAccountBalances,
  computeOrgBalances,
  computeBalanceAsOf,
  getAccountBalance,
  flattenBalances,
  ALL_ACCOUNTS,
  type LedgerEntryLike,
  type AccountBalances,
} from "../fiat/treasury-balances";

function entry(
  account: string,
  direction: string,
  amountMinor: bigint | number,
  currency: string = "USD",
  createdAt: Date = new Date("2025-06-01")
): LedgerEntryLike {
  return { account, direction, amountMinor, currency, createdAt } as LedgerEntryLike;
}

describe("Treasury Balances Engine", () => {
  describe("applyLedgerEntry", () => {
    it("applies DEBIT (increases account balance)", () => {
      const state: AccountBalances = {};
      applyLedgerEntry(state, entry("VENDOR_PAYABLE", "DEBIT", 10000n));
      expect(state.VENDOR_PAYABLE!.USD).toBe(10000n);
    });

    it("applies CREDIT (decreases account balance)", () => {
      const state: AccountBalances = { VENDOR_PAYABLE: { USD: 10000n } };
      applyLedgerEntry(state, entry("VENDOR_PAYABLE", "CREDIT", 3000n));
      expect(state.VENDOR_PAYABLE!.USD).toBe(7000n);
    });

    it("handles negative balances", () => {
      const state: AccountBalances = {};
      applyLedgerEntry(state, entry("CLEARING", "CREDIT", 5000n));
      expect(state.CLEARING!.USD).toBe(-5000n);
    });

    it("handles number amounts", () => {
      const state: AccountBalances = {};
      applyLedgerEntry(state, entry("CLEARING", "DEBIT", 1500));
      expect(state.CLEARING!.USD).toBe(1500n);
    });

    it("supports multiple currencies", () => {
      const state: AccountBalances = {};
      applyLedgerEntry(state, entry("VENDOR_PAYABLE", "DEBIT", 1000n, "USD"));
      applyLedgerEntry(state, entry("VENDOR_PAYABLE", "DEBIT", 2000n, "EUR"));
      expect(state.VENDOR_PAYABLE!.USD).toBe(1000n);
      expect(state.VENDOR_PAYABLE!.EUR).toBe(2000n);
    });

    it("currency is normalized to uppercase", () => {
      const state: AccountBalances = {};
      applyLedgerEntry(state, entry("CLEARING", "DEBIT", 100n, "usd"));
      expect(state.CLEARING!.USD).toBe(100n);
    });
  });

  describe("computeAccountBalances", () => {
    it("computes balances from empty entries", () => {
      const result = computeAccountBalances([]);
      expect(result).toEqual({});
    });

    it("computes balances from multiple entries", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 10000n),
        entry("CLEARING", "CREDIT", 10000n),
        entry("PROVIDER_WALLET", "DEBIT", 10000n),
        entry("TREASURY_WALLET", "CREDIT", 10000n),
      ];
      const result = computeAccountBalances(entries);
      expect(result.VENDOR_PAYABLE!.USD).toBe(10000n);
      expect(result.CLEARING!.USD).toBe(-10000n);
      expect(result.PROVIDER_WALLET!.USD).toBe(10000n);
      expect(result.TREASURY_WALLET!.USD).toBe(-10000n);
    });

    it("net-zero payout lifecycle sums to zero", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 5000n),
        entry("CLEARING", "CREDIT", 5000n),
        entry("PROVIDER_WALLET", "DEBIT", 5000n),
        entry("TREASURY_WALLET", "CREDIT", 5000n),
        entry("CLEARING", "DEBIT", 5000n),
        entry("PROVIDER_WALLET", "CREDIT", 5000n),
        entry("CLEARING", "DEBIT", 5000n),
        entry("VENDOR_PAYABLE", "CREDIT", 5000n),
      ];
      const result = computeAccountBalances(entries);
      let total = 0n;
      for (const acct of Object.values(result)) {
        for (const bal of Object.values(acct)) {
          total += bal;
        }
      }
      expect(total).toBe(0n);
    });

    it("handles BigInt values correctly", () => {
      const entries: LedgerEntryLike[] = [
        entry("TREASURY_WALLET", "DEBIT", 9999999999999n),
        entry("TREASURY_WALLET", "CREDIT", 1n),
      ];
      const result = computeAccountBalances(entries);
      expect(result.TREASURY_WALLET!.USD).toBe(9999999999998n);
    });
  });

  describe("computeOrgBalances", () => {
    it("returns totalByCurrency", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 1000n, "USD"),
        entry("CLEARING", "CREDIT", 500n, "USD"),
      ];
      const result = computeOrgBalances(entries);
      expect(result.totalByCurrency.USD).toBe(500n);
    });

    it("handles multiple currencies in totalByCurrency", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 1000n, "USD"),
        entry("VENDOR_PAYABLE", "DEBIT", 2000n, "EUR"),
      ];
      const result = computeOrgBalances(entries);
      expect(result.totalByCurrency.USD).toBe(1000n);
      expect(result.totalByCurrency.EUR).toBe(2000n);
    });

    it("byAccount matches computeAccountBalances", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 3000n),
      ];
      const orgBal = computeOrgBalances(entries);
      const acctBal = computeAccountBalances(entries);
      expect(orgBal.byAccount).toEqual(acctBal);
    });
  });

  describe("computeBalanceAsOf", () => {
    it("filters entries before asOf", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 1000n, "USD", new Date("2025-01-01")),
        entry("VENDOR_PAYABLE", "DEBIT", 2000n, "USD", new Date("2025-06-01")),
        entry("VENDOR_PAYABLE", "DEBIT", 3000n, "USD", new Date("2025-12-01")),
      ];
      const result = computeBalanceAsOf(entries, new Date("2025-07-01"));
      expect(result.byAccount.VENDOR_PAYABLE!.USD).toBe(3000n);
    });

    it("includes entries exactly at asOf", () => {
      const asOf = new Date("2025-06-01T00:00:00.000Z");
      const entries: LedgerEntryLike[] = [
        entry("CLEARING", "DEBIT", 500n, "USD", asOf),
      ];
      const result = computeBalanceAsOf(entries, asOf);
      expect(result.byAccount.CLEARING!.USD).toBe(500n);
    });

    it("returns empty for future asOf with no entries", () => {
      const result = computeBalanceAsOf([], new Date("2030-01-01"));
      expect(Object.keys(result.byAccount)).toHaveLength(0);
    });

    it("excludes entries after asOf", () => {
      const entries: LedgerEntryLike[] = [
        entry("CLEARING", "DEBIT", 1000n, "USD", new Date("2025-12-01")),
      ];
      const result = computeBalanceAsOf(entries, new Date("2025-01-01"));
      expect(result.byAccount.CLEARING).toBeUndefined();
    });
  });

  describe("getAccountBalance", () => {
    it("returns balance for existing account+currency", () => {
      const balances: AccountBalances = { CLEARING: { USD: 5000n } };
      expect(getAccountBalance(balances, "CLEARING", "USD")).toBe(5000n);
    });

    it("returns 0n for missing account", () => {
      expect(getAccountBalance({}, "CLEARING", "USD")).toBe(0n);
    });

    it("returns 0n for missing currency", () => {
      const balances: AccountBalances = { CLEARING: { USD: 5000n } };
      expect(getAccountBalance(balances, "CLEARING", "EUR")).toBe(0n);
    });

    it("defaults to USD", () => {
      const balances: AccountBalances = { CLEARING: { USD: 100n } };
      expect(getAccountBalance(balances, "CLEARING")).toBe(100n);
    });
  });

  describe("flattenBalances", () => {
    it("flattens multi-account multi-currency", () => {
      const byAccount: AccountBalances = {
        VENDOR_PAYABLE: { USD: 1000n, EUR: 2000n },
        CLEARING: { USD: -500n },
      };
      const flat = flattenBalances(byAccount);
      expect(flat).toHaveLength(3);
      expect(flat.find((f) => f.account === "VENDOR_PAYABLE" && f.currency === "EUR")?.balanceMinor).toBe(2000n);
    });

    it("returns empty for empty input", () => {
      expect(flattenBalances({})).toHaveLength(0);
    });
  });

  describe("ALL_ACCOUNTS", () => {
    it("contains all 6 treasury accounts", () => {
      expect(ALL_ACCOUNTS).toHaveLength(6);
      expect(ALL_ACCOUNTS).toContain("TREASURY_WALLET");
      expect(ALL_ACCOUNTS).toContain("PROVIDER_WALLET");
      expect(ALL_ACCOUNTS).toContain("VENDOR_PAYABLE");
      expect(ALL_ACCOUNTS).toContain("CLEARING");
      expect(ALL_ACCOUNTS).toContain("FEES_EXPENSE");
      expect(ALL_ACCOUNTS).toContain("SUSPENSE");
    });
  });
});
