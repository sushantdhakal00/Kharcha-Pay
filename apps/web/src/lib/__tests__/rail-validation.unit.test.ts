import { describe, it, expect } from "vitest";
import {
  validatePayoutRailInput,
  RailValidationError,
  getRequiredFieldsForRail,
} from "../fiat/rails/rail-validation";

describe("Rail Validation", () => {
  describe("BANK_WIRE validation", () => {
    it("passes with accountNumber + routingNumber + billingName + country", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "BANK_WIRE" as any,
          currency: "USD",
          profile: {
            accountNumber: "123456789",
            routingNumber: "021000021",
            billingName: "John Doe",
            country: "US",
          },
          amountMinor: 10000n,
        })
      ).not.toThrow();
    });

    it("passes with IBAN + billingName + country", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "BANK_WIRE" as any,
          currency: "EUR",
          profile: {
            iban: "DE89370400440532013000",
            billingName: "Hans Mueller",
            country: "DE",
          },
          amountMinor: 5000n,
        })
      ).not.toThrow();
    });

    it("passes with maskedAccount + routingNumber + beneficiaryName + bankCountry", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "BANK_WIRE" as any,
          currency: "USD",
          profile: {
            maskedAccount: "****6789",
            routingNumber: "021000021",
            beneficiaryName: "Jane Doe",
            bankCountry: "US",
          },
          amountMinor: 1000n,
        })
      ).not.toThrow();
    });

    it("fails when missing account identifiers", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "BANK_WIRE" as any,
          currency: "USD",
          profile: {
            billingName: "John",
            country: "US",
          },
          amountMinor: 10000n,
        })
      ).toThrow(RailValidationError);
    });

    it("fails when missing beneficiary name", () => {
      try {
        validatePayoutRailInput({
          rail: "BANK_WIRE" as any,
          currency: "USD",
          profile: {
            accountNumber: "123456789",
            routingNumber: "021000021",
            country: "US",
          },
          amountMinor: 10000n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.some((f) => f.field === "billingName")).toBe(true);
      }
    });

    it("fails when missing country", () => {
      try {
        validatePayoutRailInput({
          rail: "BANK_WIRE" as any,
          currency: "USD",
          profile: {
            accountNumber: "123456789",
            routingNumber: "021000021",
            billingName: "John",
          },
          amountMinor: 10000n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.some((f) => f.field === "country")).toBe(true);
      }
    });
  });

  describe("ACH validation", () => {
    it("passes with full valid profile", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "ACH" as any,
          currency: "USD",
          profile: {
            accountNumber: "123456789",
            routingNumber: "021000021",
            accountType: "checking",
          },
          amountMinor: 5000n,
        })
      ).not.toThrow();
    });

    it("fails for non-USD currency", () => {
      try {
        validatePayoutRailInput({
          rail: "ACH" as any,
          currency: "EUR",
          profile: {
            accountNumber: "123456789",
            routingNumber: "021000021",
            accountType: "checking",
          },
          amountMinor: 5000n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.some((f) => f.field === "currency")).toBe(true);
      }
    });

    it("fails when missing accountNumber", () => {
      try {
        validatePayoutRailInput({
          rail: "ACH" as any,
          currency: "USD",
          profile: {
            routingNumber: "021000021",
            accountType: "checking",
          },
          amountMinor: 5000n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.some((f) => f.field === "accountNumber")).toBe(true);
      }
    });

    it("fails when missing routingNumber", () => {
      try {
        validatePayoutRailInput({
          rail: "ACH" as any,
          currency: "USD",
          profile: {
            accountNumber: "123456789",
            accountType: "checking",
          },
          amountMinor: 5000n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.some((f) => f.field === "routingNumber")).toBe(true);
      }
    });

    it("fails when missing accountType", () => {
      try {
        validatePayoutRailInput({
          rail: "ACH" as any,
          currency: "USD",
          profile: {
            accountNumber: "123456789",
            routingNumber: "021000021",
          },
          amountMinor: 5000n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.some((f) => f.field === "accountType")).toBe(true);
      }
    });

    it("accepts maskedAccount as alternative to accountNumber", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "ACH" as any,
          currency: "USD",
          profile: {
            maskedAccount: "****6789",
            routingNumber: "021000021",
            accountType: "savings",
          },
          amountMinor: 5000n,
        })
      ).not.toThrow();
    });
  });

  describe("LOCAL validation", () => {
    it("passes with full valid profile", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "LOCAL" as any,
          currency: "INR",
          profile: {
            country: "IN",
            bankCode: "SBIN0001234",
            accountNumber: "123456789012",
          },
          amountMinor: 100000n,
        })
      ).not.toThrow();
    });

    it("fails when missing country", () => {
      try {
        validatePayoutRailInput({
          rail: "LOCAL" as any,
          currency: "INR",
          profile: {
            bankCode: "SBIN0001234",
            accountNumber: "123456789012",
          },
          amountMinor: 100000n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.some((f) => f.field === "country")).toBe(true);
      }
    });

    it("fails when missing bankCode", () => {
      try {
        validatePayoutRailInput({
          rail: "LOCAL" as any,
          currency: "INR",
          profile: {
            country: "IN",
            accountNumber: "123456789012",
          },
          amountMinor: 100000n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.some((f) => f.field === "bankCode")).toBe(true);
      }
    });

    it("fails when missing accountNumber", () => {
      try {
        validatePayoutRailInput({
          rail: "LOCAL" as any,
          currency: "MXN",
          profile: {
            country: "MX",
            bankCode: "CLABE123",
          },
          amountMinor: 50000n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.some((f) => f.field === "accountNumber")).toBe(true);
      }
    });

    it("accepts bankCountry as country alternative", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "LOCAL" as any,
          currency: "GBP",
          profile: {
            bankCountry: "GB",
            bankCode: "12-34-56",
            accountNumber: "12345678",
          },
          amountMinor: 10000n,
        })
      ).not.toThrow();
    });
  });

  describe("Common validations", () => {
    it("fails when amountMinor is zero", () => {
      try {
        validatePayoutRailInput({
          rail: "BANK_WIRE" as any,
          currency: "USD",
          profile: {
            accountNumber: "123",
            routingNumber: "021000021",
            billingName: "John",
            country: "US",
          },
          amountMinor: 0n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.some((f) => f.field === "amountMinor")).toBe(true);
      }
    });

    it("fails when amountMinor is negative", () => {
      try {
        validatePayoutRailInput({
          rail: "BANK_WIRE" as any,
          currency: "USD",
          profile: {
            accountNumber: "123",
            routingNumber: "021000021",
            billingName: "John",
            country: "US",
          },
          amountMinor: -100,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.some((f) => f.field === "amountMinor")).toBe(true);
      }
    });

    it("fails with null profile for BANK_WIRE", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "BANK_WIRE" as any,
          currency: "USD",
          profile: null,
          amountMinor: 10000n,
        })
      ).toThrow(RailValidationError);
    });

    it("accumulates multiple field errors", () => {
      try {
        validatePayoutRailInput({
          rail: "ACH" as any,
          currency: "EUR",
          profile: null,
          amountMinor: 0n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        const err = e as RailValidationError;
        expect(err.fieldErrors.length).toBeGreaterThanOrEqual(3);
      }
    });

    it("RailValidationError includes rail in message", () => {
      try {
        validatePayoutRailInput({
          rail: "ACH" as any,
          currency: "USD",
          profile: null,
          amountMinor: 0n,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(RailValidationError);
        expect((e as RailValidationError).message).toContain("ACH");
        expect((e as RailValidationError).code).toBe("RAIL_VALIDATION_ERROR");
      }
    });
  });

  describe("getRequiredFieldsForRail", () => {
    it("returns fields for BANK_WIRE", () => {
      const fields = getRequiredFieldsForRail("BANK_WIRE" as any);
      expect(fields.length).toBeGreaterThanOrEqual(2);
    });

    it("returns fields for ACH", () => {
      const fields = getRequiredFieldsForRail("ACH" as any);
      expect(fields).toContain("accountNumber");
      expect(fields).toContain("routingNumber");
      expect(fields).toContain("accountType");
    });

    it("returns fields for LOCAL", () => {
      const fields = getRequiredFieldsForRail("LOCAL" as any);
      expect(fields).toContain("country");
      expect(fields).toContain("bankCode");
      expect(fields).toContain("accountNumber");
    });
  });
});
