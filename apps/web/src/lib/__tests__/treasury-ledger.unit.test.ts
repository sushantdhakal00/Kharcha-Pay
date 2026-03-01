import { describe, it, expect, vi, beforeEach } from "vitest";
import { TreasuryLedgerAccount, LedgerDirection } from "@prisma/client";
import { computeLedgerSummary } from "../fiat/treasury-ledger";

function makeEntry(overrides: {
  account: TreasuryLedgerAccount;
  direction: LedgerDirection;
  amountMinor: number;
  daysAgo?: number;
}) {
  const createdAt = new Date();
  if (overrides.daysAgo) {
    createdAt.setDate(createdAt.getDate() - overrides.daysAgo);
  }
  return {
    account: overrides.account,
    direction: overrides.direction,
    amountMinor: BigInt(overrides.amountMinor),
    createdAt,
  };
}

describe("treasury-ledger", () => {
  describe("computeLedgerSummary", () => {
    it("returns zeros for empty entries", () => {
      const result = computeLedgerSummary([]);
      expect(result).toEqual({
        outstandingVendorPayable: 0,
        inFlightClearing: 0,
        fees30d: 0,
      });
    });

    it("computes VENDOR_PAYABLE net (debit positive, credit negative)", () => {
      const entries = [
        makeEntry({ account: "VENDOR_PAYABLE", direction: "DEBIT", amountMinor: 10000 }),
        makeEntry({ account: "VENDOR_PAYABLE", direction: "CREDIT", amountMinor: 3000 }),
      ];
      const result = computeLedgerSummary(entries);
      expect(result.outstandingVendorPayable).toBe(7000);
    });

    it("computes CLEARING net correctly", () => {
      const entries = [
        makeEntry({ account: "CLEARING", direction: "CREDIT", amountMinor: 10000 }),
        makeEntry({ account: "CLEARING", direction: "DEBIT", amountMinor: 4000 }),
      ];
      const result = computeLedgerSummary(entries);
      expect(result.inFlightClearing).toBe(-6000);
    });

    it("computes VENDOR_PAYABLE zero when balanced", () => {
      const entries = [
        makeEntry({ account: "VENDOR_PAYABLE", direction: "DEBIT", amountMinor: 5000 }),
        makeEntry({ account: "VENDOR_PAYABLE", direction: "CREDIT", amountMinor: 5000 }),
      ];
      const result = computeLedgerSummary(entries);
      expect(result.outstandingVendorPayable).toBe(0);
    });

    it("accumulates fees in the last 30 days (DEBIT only)", () => {
      const entries = [
        makeEntry({ account: "FEES_EXPENSE", direction: "DEBIT", amountMinor: 150, daysAgo: 5 }),
        makeEntry({ account: "FEES_EXPENSE", direction: "DEBIT", amountMinor: 250, daysAgo: 10 }),
      ];
      const result = computeLedgerSummary(entries);
      expect(result.fees30d).toBe(400);
    });

    it("excludes fees older than 30 days", () => {
      const entries = [
        makeEntry({ account: "FEES_EXPENSE", direction: "DEBIT", amountMinor: 150, daysAgo: 5 }),
        makeEntry({ account: "FEES_EXPENSE", direction: "DEBIT", amountMinor: 500, daysAgo: 45 }),
      ];
      const result = computeLedgerSummary(entries);
      expect(result.fees30d).toBe(150);
    });

    it("does not count CREDIT fees in fees30d", () => {
      const entries = [
        makeEntry({ account: "FEES_EXPENSE", direction: "CREDIT", amountMinor: 150 }),
      ];
      const result = computeLedgerSummary(entries);
      expect(result.fees30d).toBe(0);
    });

    it("ignores non-target accounts in vendor payable and clearing", () => {
      const entries = [
        makeEntry({ account: "TREASURY_WALLET", direction: "DEBIT", amountMinor: 9999 }),
        makeEntry({ account: "PROVIDER_WALLET", direction: "CREDIT", amountMinor: 9999 }),
        makeEntry({ account: "SUSPENSE", direction: "DEBIT", amountMinor: 5000 }),
      ];
      const result = computeLedgerSummary(entries);
      expect(result.outstandingVendorPayable).toBe(0);
      expect(result.inFlightClearing).toBe(0);
    });

    it("handles a full payout lifecycle (created -> completed)", () => {
      const entries = [
        // PAYOUT_CREATED: DR VENDOR_PAYABLE, CR CLEARING
        makeEntry({ account: "VENDOR_PAYABLE", direction: "DEBIT", amountMinor: 10000 }),
        makeEntry({ account: "CLEARING", direction: "CREDIT", amountMinor: 10000 }),
        // PAYOUT_PROVIDER_SUBMITTED: DR CLEARING, CR PROVIDER_WALLET
        makeEntry({ account: "CLEARING", direction: "DEBIT", amountMinor: 10000 }),
        makeEntry({ account: "PROVIDER_WALLET", direction: "CREDIT", amountMinor: 10000 }),
        // PAYOUT_COMPLETED: DR CLEARING, CR VENDOR_PAYABLE
        makeEntry({ account: "CLEARING", direction: "DEBIT", amountMinor: 10000 }),
        makeEntry({ account: "VENDOR_PAYABLE", direction: "CREDIT", amountMinor: 10000 }),
      ];
      const result = computeLedgerSummary(entries);
      expect(result.outstandingVendorPayable).toBe(0);
      expect(result.inFlightClearing).toBe(10000);
    });

    it("handles a failed payout (reversal)", () => {
      const entries = [
        // PAYOUT_CREATED
        makeEntry({ account: "VENDOR_PAYABLE", direction: "DEBIT", amountMinor: 5000 }),
        makeEntry({ account: "CLEARING", direction: "CREDIT", amountMinor: 5000 }),
        // PAYOUT_FAILED reversal
        makeEntry({ account: "VENDOR_PAYABLE", direction: "CREDIT", amountMinor: 5000 }),
        makeEntry({ account: "CLEARING", direction: "DEBIT", amountMinor: 5000 }),
      ];
      const result = computeLedgerSummary(entries);
      expect(result.outstandingVendorPayable).toBe(0);
      expect(result.inFlightClearing).toBe(0);
    });

    it("handles multiple payouts in different states", () => {
      const entries = [
        // Payout A: created (still outstanding)
        makeEntry({ account: "VENDOR_PAYABLE", direction: "DEBIT", amountMinor: 10000 }),
        makeEntry({ account: "CLEARING", direction: "CREDIT", amountMinor: 10000 }),
        // Payout B: created and completed
        makeEntry({ account: "VENDOR_PAYABLE", direction: "DEBIT", amountMinor: 5000 }),
        makeEntry({ account: "CLEARING", direction: "CREDIT", amountMinor: 5000 }),
        makeEntry({ account: "CLEARING", direction: "DEBIT", amountMinor: 5000 }),
        makeEntry({ account: "VENDOR_PAYABLE", direction: "CREDIT", amountMinor: 5000 }),
      ];
      const result = computeLedgerSummary(entries);
      expect(result.outstandingVendorPayable).toBe(10000);
    });

    it("handles BigInt amounts correctly", () => {
      const entries = [
        makeEntry({ account: "VENDOR_PAYABLE", direction: "DEBIT", amountMinor: 99999999 }),
      ];
      const result = computeLedgerSummary(entries);
      expect(result.outstandingVendorPayable).toBe(99999999);
    });
  });
});
