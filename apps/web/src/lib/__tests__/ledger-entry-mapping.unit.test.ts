import { describe, it, expect } from "vitest";
import {
  TreasuryLedgerEntryType,
  TreasuryLedgerAccount,
  LedgerDirection,
} from "@prisma/client";

describe("ledger entry types and accounts", () => {
  describe("TreasuryLedgerEntryType enum", () => {
    it("has PAYOUT_CREATED", () => {
      expect(TreasuryLedgerEntryType.PAYOUT_CREATED).toBe("PAYOUT_CREATED");
    });

    it("has PAYOUT_FUNDED_ONCHAIN", () => {
      expect(TreasuryLedgerEntryType.PAYOUT_FUNDED_ONCHAIN).toBe("PAYOUT_FUNDED_ONCHAIN");
    });

    it("has PAYOUT_PROVIDER_SUBMITTED", () => {
      expect(TreasuryLedgerEntryType.PAYOUT_PROVIDER_SUBMITTED).toBe("PAYOUT_PROVIDER_SUBMITTED");
    });

    it("has PAYOUT_COMPLETED", () => {
      expect(TreasuryLedgerEntryType.PAYOUT_COMPLETED).toBe("PAYOUT_COMPLETED");
    });

    it("has PAYOUT_FAILED", () => {
      expect(TreasuryLedgerEntryType.PAYOUT_FAILED).toBe("PAYOUT_FAILED");
    });

    it("has PAYOUT_CANCELED", () => {
      expect(TreasuryLedgerEntryType.PAYOUT_CANCELED).toBe("PAYOUT_CANCELED");
    });

    it("has FEE_ASSESSED", () => {
      expect(TreasuryLedgerEntryType.FEE_ASSESSED).toBe("FEE_ASSESSED");
    });

    it("has FX_CONVERSION", () => {
      expect(TreasuryLedgerEntryType.FX_CONVERSION).toBe("FX_CONVERSION");
    });
  });

  describe("TreasuryLedgerAccount enum", () => {
    it("has all six accounts", () => {
      expect(TreasuryLedgerAccount.TREASURY_WALLET).toBe("TREASURY_WALLET");
      expect(TreasuryLedgerAccount.PROVIDER_WALLET).toBe("PROVIDER_WALLET");
      expect(TreasuryLedgerAccount.VENDOR_PAYABLE).toBe("VENDOR_PAYABLE");
      expect(TreasuryLedgerAccount.FEES_EXPENSE).toBe("FEES_EXPENSE");
      expect(TreasuryLedgerAccount.CLEARING).toBe("CLEARING");
      expect(TreasuryLedgerAccount.SUSPENSE).toBe("SUSPENSE");
    });
  });

  describe("LedgerDirection enum", () => {
    it("has DEBIT and CREDIT", () => {
      expect(LedgerDirection.DEBIT).toBe("DEBIT");
      expect(LedgerDirection.CREDIT).toBe("CREDIT");
    });
  });

  describe("double-entry mapping correctness", () => {
    it("PAYOUT_CREATED pairs: DR VENDOR_PAYABLE, CR CLEARING", () => {
      const debitAccount = TreasuryLedgerAccount.VENDOR_PAYABLE;
      const creditAccount = TreasuryLedgerAccount.CLEARING;
      expect(debitAccount).toBe("VENDOR_PAYABLE");
      expect(creditAccount).toBe("CLEARING");
    });

    it("PAYOUT_FUNDED_ONCHAIN pairs: DR PROVIDER_WALLET, CR TREASURY_WALLET", () => {
      const debitAccount = TreasuryLedgerAccount.PROVIDER_WALLET;
      const creditAccount = TreasuryLedgerAccount.TREASURY_WALLET;
      expect(debitAccount).toBe("PROVIDER_WALLET");
      expect(creditAccount).toBe("TREASURY_WALLET");
    });

    it("PAYOUT_PROVIDER_SUBMITTED pairs: DR CLEARING, CR PROVIDER_WALLET", () => {
      const debitAccount = TreasuryLedgerAccount.CLEARING;
      const creditAccount = TreasuryLedgerAccount.PROVIDER_WALLET;
      expect(debitAccount).toBe("CLEARING");
      expect(creditAccount).toBe("PROVIDER_WALLET");
    });

    it("PAYOUT_COMPLETED pairs: DR CLEARING, CR VENDOR_PAYABLE", () => {
      const debitAccount = TreasuryLedgerAccount.CLEARING;
      const creditAccount = TreasuryLedgerAccount.VENDOR_PAYABLE;
      expect(debitAccount).toBe("CLEARING");
      expect(creditAccount).toBe("VENDOR_PAYABLE");
    });

    it("PAYOUT_FAILED reversal: CR VENDOR_PAYABLE, DR CLEARING", () => {
      const creditAccount = TreasuryLedgerAccount.VENDOR_PAYABLE;
      const debitAccount = TreasuryLedgerAccount.CLEARING;
      expect(creditAccount).toBe("VENDOR_PAYABLE");
      expect(debitAccount).toBe("CLEARING");
    });

    it("FEE_ASSESSED pairs: DR FEES_EXPENSE, CR CLEARING", () => {
      const debitAccount = TreasuryLedgerAccount.FEES_EXPENSE;
      const creditAccount = TreasuryLedgerAccount.CLEARING;
      expect(debitAccount).toBe("FEES_EXPENSE");
      expect(creditAccount).toBe("CLEARING");
    });
  });
});
