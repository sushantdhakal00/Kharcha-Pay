import { describe, it, expect } from "vitest";
import {
  computeAccountBalances,
  flattenBalances,
  type LedgerEntryLike,
} from "../fiat/treasury-balances";

function entry(
  account: string,
  direction: string,
  amountMinor: bigint,
  currency: string = "USD",
  createdAt: Date = new Date()
): LedgerEntryLike {
  return { account, direction, amountMinor, currency, createdAt } as LedgerEntryLike;
}

describe("Balance Snapshotter (pure logic)", () => {
  describe("computeAccountBalances for snapshot", () => {
    it("produces correct snapshot data from ledger entries", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 10000n),
        entry("CLEARING", "CREDIT", 10000n),
        entry("PROVIDER_WALLET", "DEBIT", 10000n),
        entry("TREASURY_WALLET", "CREDIT", 10000n),
      ];
      const balances = computeAccountBalances(entries);
      expect(balances.VENDOR_PAYABLE!.USD).toBe(10000n);
      expect(balances.CLEARING!.USD).toBe(-10000n);
    });

    it("handles empty entries", () => {
      const balances = computeAccountBalances([]);
      expect(Object.keys(balances)).toHaveLength(0);
    });

    it("groups by currency correctly", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 1000n, "USD"),
        entry("VENDOR_PAYABLE", "DEBIT", 2000n, "EUR"),
        entry("VENDOR_PAYABLE", "DEBIT", 3000n, "USD"),
      ];
      const balances = computeAccountBalances(entries);
      expect(balances.VENDOR_PAYABLE!.USD).toBe(4000n);
      expect(balances.VENDOR_PAYABLE!.EUR).toBe(2000n);
    });
  });

  describe("flattenBalances for snapshot rows", () => {
    it("produces rows for each account+currency", () => {
      const balances = computeAccountBalances([
        entry("VENDOR_PAYABLE", "DEBIT", 1000n, "USD"),
        entry("CLEARING", "CREDIT", 500n, "USD"),
        entry("VENDOR_PAYABLE", "DEBIT", 2000n, "EUR"),
      ]);
      const flat = flattenBalances(balances);
      expect(flat).toHaveLength(3);
    });

    it("each row has account, currency, balanceMinor", () => {
      const flat = flattenBalances({ CLEARING: { USD: 100n } });
      expect(flat[0]).toEqual({
        account: "CLEARING",
        currency: "USD",
        balanceMinor: 100n,
      });
    });

    it("returns empty array for empty balances", () => {
      expect(flattenBalances({})).toEqual([]);
    });
  });

  describe("Idempotency shape", () => {
    it("same entries produce same balances", () => {
      const entries: LedgerEntryLike[] = [
        entry("VENDOR_PAYABLE", "DEBIT", 5000n),
        entry("CLEARING", "CREDIT", 5000n),
      ];
      const b1 = computeAccountBalances([...entries]);
      const b2 = computeAccountBalances([...entries]);
      expect(b1).toEqual(b2);
    });

    it("duplicate entries accumulate (no dedup at this layer)", () => {
      const e = entry("CLEARING", "DEBIT", 100n);
      const balances = computeAccountBalances([e, e, e]);
      expect(balances.CLEARING!.USD).toBe(300n);
    });
  });

  describe("Snapshot data format", () => {
    it("balanceMinor is BigInt", () => {
      const flat = flattenBalances({ CLEARING: { USD: 999n } });
      expect(typeof flat[0].balanceMinor).toBe("bigint");
    });

    it("handles very large BigInt values", () => {
      const flat = flattenBalances({
        TREASURY_WALLET: { USD: 99999999999999n },
      });
      expect(flat[0].balanceMinor).toBe(99999999999999n);
    });
  });
});
