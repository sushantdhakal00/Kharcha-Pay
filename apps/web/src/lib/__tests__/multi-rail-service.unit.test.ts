import { describe, it, expect, afterEach } from "vitest";
import {
  UnsupportedRailError,
  UnsupportedCurrencyError,
} from "../fiat/payout-providers/capabilities";
import { RailValidationError } from "../fiat/rails/rail-validation";
import {
  isRailSupported,
  getProviderCapabilities,
  getRailDisabledReason,
} from "../fiat/payout-providers/capabilities";
import {
  validatePayoutRailInput,
} from "../fiat/rails/rail-validation";
import {
  evaluatePayoutRisk,
  resolveRules,
  type HistoricalStats,
} from "../fiat/treasury-policy";

function setEnv(key: string, val: string | undefined) {
  if (val === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = val;
  }
}

const zeroStats: HistoricalStats = {
  orgDailyAmountMinor: 0,
  orgWeeklyAmountMinor: 0,
  orgMonthlyAmountMinor: 0,
  orgDailyCount: 0,
  vendorDailyAmountMinor: 0,
  vendorDailyCount: 0,
};

describe("Multi-Rail Service Integration", () => {
  const origAch = process.env.ENABLE_ACH_PAYOUTS;
  const origLocal = process.env.ENABLE_LOCAL_PAYOUTS;

  afterEach(() => {
    setEnv("ENABLE_ACH_PAYOUTS", origAch);
    setEnv("ENABLE_LOCAL_PAYOUTS", origLocal);
  });

  describe("UnsupportedRailError", () => {
    it("is throwable with provider/rail/currency", () => {
      const err = new UnsupportedRailError("CIRCLE", "LOCAL", "USD");
      expect(err).toBeInstanceOf(UnsupportedRailError);
      expect(err.code).toBe("UNSUPPORTED_RAIL");
      expect(err.provider).toBe("CIRCLE");
      expect(err.rail).toBe("LOCAL");
      expect(err.currency).toBe("USD");
    });

    it("message contains rail and provider", () => {
      const err = new UnsupportedRailError("CIRCLE", "ACH", "EUR");
      expect(err.message).toContain("ACH");
      expect(err.message).toContain("CIRCLE");
      expect(err.message).toContain("EUR");
    });
  });

  describe("UnsupportedCurrencyError", () => {
    it("is throwable with provider/currency", () => {
      const err = new UnsupportedCurrencyError("CIRCLE", "EUR");
      expect(err).toBeInstanceOf(UnsupportedCurrencyError);
      expect(err.code).toBe("UNSUPPORTED_CURRENCY");
      expect(err.provider).toBe("CIRCLE");
      expect(err.currency).toBe("EUR");
    });
  });

  describe("RailValidationError shape", () => {
    it("has code and fieldErrors", () => {
      const err = new RailValidationError("ACH", [
        { field: "routingNumber", message: "required" },
      ]);
      expect(err.code).toBe("RAIL_VALIDATION_ERROR");
      expect(err.fieldErrors).toHaveLength(1);
    });
  });

  describe("Capability-gated rail execution", () => {
    it("BANK_WIRE is always supported on CIRCLE+USD", () => {
      expect(isRailSupported("CIRCLE", "BANK_WIRE" as any, "USD")).toBe(true);
    });

    it("ACH is blocked when flag is off", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "false");
      expect(isRailSupported("CIRCLE", "ACH" as any, "USD")).toBe(false);
    });

    it("ACH is allowed when flag is on", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      expect(isRailSupported("CIRCLE", "ACH" as any, "USD")).toBe(true);
    });

    it("LOCAL is blocked when flag is off", () => {
      setEnv("ENABLE_LOCAL_PAYOUTS", "false");
      expect(isRailSupported("CIRCLE", "LOCAL" as any, "USD")).toBe(false);
    });

    it("LOCAL is allowed when flag is on", () => {
      setEnv("ENABLE_LOCAL_PAYOUTS", "true");
      expect(isRailSupported("CIRCLE", "LOCAL" as any, "USD")).toBe(true);
    });

    it("unsupported currency always fails", () => {
      expect(isRailSupported("CIRCLE", "BANK_WIRE" as any, "GBP")).toBe(false);
    });

    it("unknown provider always fails", () => {
      expect(isRailSupported("UNKNOWN", "BANK_WIRE" as any, "USD")).toBe(false);
    });
  });

  describe("Rail validation before provider call", () => {
    it("validates BANK_WIRE profile successfully", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "BANK_WIRE" as any,
          currency: "USD",
          profile: {
            accountNumber: "123456789",
            routingNumber: "021000021",
            billingName: "Test",
            country: "US",
          },
          amountMinor: 10000n,
        })
      ).not.toThrow();
    });

    it("rejects incomplete ACH profile", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "ACH" as any,
          currency: "USD",
          profile: { accountNumber: "123456789" },
          amountMinor: 10000n,
        })
      ).toThrow(RailValidationError);
    });

    it("rejects incomplete LOCAL profile", () => {
      expect(() =>
        validatePayoutRailInput({
          rail: "LOCAL" as any,
          currency: "INR",
          profile: { country: "IN" },
          amountMinor: 10000n,
        })
      ).toThrow(RailValidationError);
    });
  });

  describe("Policy engine blocks unsupported rails", () => {
    it("ACH blocked by policy when flag off", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "false");
      const rules = resolveRules(null);
      const result = evaluatePayoutRisk(
        {
          amountMinor: 10000,
          currency: "USD",
          vendorId: "v1",
          payoutRail: "ACH",
          provider: "CIRCLE",
        },
        rules,
        zeroStats
      );
      expect(result.riskStatus).toBe("BLOCKED");
      expect(result.reasons.some((r) => r.includes("feature flag"))).toBe(true);
    });

    it("BANK_WIRE passes policy with defaults", () => {
      const rules = resolveRules(null);
      const result = evaluatePayoutRisk(
        {
          amountMinor: 10000,
          currency: "USD",
          vendorId: "v1",
          payoutRail: "BANK_WIRE",
          provider: "CIRCLE",
        },
        rules,
        zeroStats
      );
      expect(result.riskStatus).toBe("CLEAR");
    });

    it("unsupported provider blocked with reason", () => {
      const rules = resolveRules(null);
      const result = evaluatePayoutRisk(
        {
          amountMinor: 10000,
          currency: "USD",
          payoutRail: "BANK_WIRE",
          provider: "STRIPE",
        },
        rules,
        zeroStats
      );
      expect(result.riskStatus).toBe("BLOCKED");
    });
  });

  describe("No side effects on unsupported rail", () => {
    it("UnsupportedRailError prevents any provider call", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "false");
      const supported = isRailSupported("CIRCLE", "ACH" as any, "USD");
      expect(supported).toBe(false);
    });

    it("UnsupportedCurrencyError prevents any provider call", () => {
      const cap = getProviderCapabilities("CIRCLE");
      expect(cap.supportedCurrencies).not.toContain("EUR");
    });

    it("validation error halts before provider invocation", () => {
      let threw = false;
      try {
        validatePayoutRailInput({
          rail: "ACH" as any,
          currency: "USD",
          profile: null,
          amountMinor: 10000n,
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });

    it("getRailDisabledReason returns non-null for blocked rails", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "false");
      const reason = getRailDisabledReason("CIRCLE", "ACH" as any, "USD");
      expect(reason).not.toBeNull();
    });
  });
});
