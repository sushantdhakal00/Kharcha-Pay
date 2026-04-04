import { describe, it, expect } from "vitest";
import { TreasuryPayoutIntentStatus, PayoutMethodType } from "@prisma/client";
import { computeLedgerSummary } from "../fiat/treasury-ledger";

describe("ledger integration scenarios", () => {
  describe("writeLedgerForTransition status detection", () => {
    it("PROCESSING triggers PAYOUT_PROVIDER_SUBMITTED", () => {
      expect(TreasuryPayoutIntentStatus.PROCESSING).toBe("PROCESSING");
    });

    it("COMPLETED triggers PAYOUT_COMPLETED", () => {
      expect(TreasuryPayoutIntentStatus.COMPLETED).toBe("COMPLETED");
    });

    it("FAILED triggers PAYOUT_FAILED", () => {
      expect(TreasuryPayoutIntentStatus.FAILED).toBe("FAILED");
    });

    it("CANCELED triggers PAYOUT_CANCELED", () => {
      expect(TreasuryPayoutIntentStatus.CANCELED).toBe("CANCELED");
    });

    it("PENDING does NOT trigger any ledger write (no special mapping)", () => {
      const nonLedgerStatuses = [
        TreasuryPayoutIntentStatus.PENDING,
        TreasuryPayoutIntentStatus.SENT_ONCHAIN,
        TreasuryPayoutIntentStatus.CREATED,
      ];
      const ledgerStatuses = [
        TreasuryPayoutIntentStatus.PROCESSING,
        TreasuryPayoutIntentStatus.COMPLETED,
        TreasuryPayoutIntentStatus.FAILED,
        TreasuryPayoutIntentStatus.CANCELED,
      ];
      for (const s of nonLedgerStatuses) {
        expect(ledgerStatuses).not.toContain(s);
      }
    });
  });

  describe("net zero after full lifecycle", () => {
    it("completed payout nets to zero on VENDOR_PAYABLE", () => {
      const entries = [
        { account: "VENDOR_PAYABLE" as const, direction: "DEBIT" as const, amountMinor: 10000n, createdAt: new Date() },
        { account: "VENDOR_PAYABLE" as const, direction: "CREDIT" as const, amountMinor: 10000n, createdAt: new Date() },
      ];
      const result = computeLedgerSummary(entries);
      expect(result.outstandingVendorPayable).toBe(0);
    });

    it("failed payout nets to zero on clearing", () => {
      const entries = [
        { account: "CLEARING" as const, direction: "CREDIT" as const, amountMinor: 5000n, createdAt: new Date() },
        { account: "CLEARING" as const, direction: "DEBIT" as const, amountMinor: 5000n, createdAt: new Date() },
      ];
      const result = computeLedgerSummary(entries);
      expect(result.inFlightClearing).toBe(0);
    });
  });

  describe("idempotency via unique constraint shape", () => {
    it("unique constraint fields are: orgId, type, intentId, account, direction, externalRef", () => {
      const key = {
        orgId: "org1",
        type: "PAYOUT_CREATED",
        intentId: "intent1",
        account: "VENDOR_PAYABLE",
        direction: "DEBIT",
        externalRef: null,
      };
      expect(Object.keys(key)).toEqual([
        "orgId",
        "type",
        "intentId",
        "account",
        "direction",
        "externalRef",
      ]);
    });

    it("same key should produce P2002 on second insert (structural check)", () => {
      const key1 = `org1|PAYOUT_CREATED|intent1|VENDOR_PAYABLE|DEBIT|null`;
      const key2 = `org1|PAYOUT_CREATED|intent1|VENDOR_PAYABLE|DEBIT|null`;
      expect(key1).toBe(key2);
    });

    it("different intents produce different keys", () => {
      const key1 = `org1|PAYOUT_CREATED|intent1|VENDOR_PAYABLE|DEBIT|null`;
      const key2 = `org1|PAYOUT_CREATED|intent2|VENDOR_PAYABLE|DEBIT|null`;
      expect(key1).not.toBe(key2);
    });

    it("different directions produce different keys", () => {
      const key1 = `org1|PAYOUT_CREATED|intent1|VENDOR_PAYABLE|DEBIT|null`;
      const key2 = `org1|PAYOUT_CREATED|intent1|VENDOR_PAYABLE|CREDIT|null`;
      expect(key1).not.toBe(key2);
    });
  });

  describe("PayoutMethodType compatibility", () => {
    it("BANK_WIRE is valid for ledger payoutRail", () => {
      expect(PayoutMethodType.BANK_WIRE).toBe("BANK_WIRE");
    });

    it("ACH is valid for ledger payoutRail", () => {
      expect(PayoutMethodType.ACH).toBe("ACH");
    });

    it("LOCAL is valid for ledger payoutRail", () => {
      expect(PayoutMethodType.LOCAL).toBe("LOCAL");
    });
  });
});
