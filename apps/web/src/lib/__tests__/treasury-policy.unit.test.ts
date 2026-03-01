import { describe, it, expect } from "vitest";
import {
  evaluatePayoutRisk,
  resolveRules,
  enforcePayoutPolicyOrThrow,
  TreasuryPolicyViolationError,
  DEFAULT_POLICY_RULES,
  type TreasuryPolicyRules,
  type PolicyEvaluationInput,
  type HistoricalStats,
} from "../fiat/treasury-policy";

const zeroStats: HistoricalStats = {
  orgDailyAmountMinor: 0,
  orgWeeklyAmountMinor: 0,
  orgMonthlyAmountMinor: 0,
  orgDailyCount: 0,
  vendorDailyAmountMinor: 0,
  vendorDailyCount: 0,
};

const baseInput: PolicyEvaluationInput = {
  amountMinor: 10000,
  currency: "USD",
  vendorId: "vendor_1",
  payoutRail: "BANK_WIRE",
  provider: "CIRCLE",
};

describe("resolveRules", () => {
  it("returns defaults when no policy provided", () => {
    const rules = resolveRules(null);
    expect(rules).toEqual(DEFAULT_POLICY_RULES);
  });

  it("merges policy rules over defaults", () => {
    const rules = resolveRules({
      rules: { dailyLimitMinor: 1000 },
    });
    expect(rules.dailyLimitMinor).toBe(1000);
    expect(rules.weeklyLimitMinor).toBe(DEFAULT_POLICY_RULES.weeklyLimitMinor);
  });

  it("allows overriding all fields", () => {
    const custom: TreasuryPolicyRules = {
      dailyLimitMinor: 100,
      weeklyLimitMinor: 200,
      monthlyLimitMinor: 300,
      maxPayoutsPerDay: 1,
    };
    const rules = resolveRules({ rules: custom });
    expect(rules.dailyLimitMinor).toBe(100);
    expect(rules.weeklyLimitMinor).toBe(200);
    expect(rules.monthlyLimitMinor).toBe(300);
    expect(rules.maxPayoutsPerDay).toBe(1);
  });
});

describe("evaluatePayoutRisk - CLEAR", () => {
  it("returns CLEAR for small payout with no limits hit", () => {
    const rules = resolveRules(null);
    const result = evaluatePayoutRisk(baseInput, rules, zeroStats);
    expect(result.riskStatus).toBe("CLEAR");
    expect(result.reasons).toHaveLength(0);
    expect(result.requiresApproval).toBe(false);
  });

  it("returns CLEAR when amount is exactly at approval threshold", () => {
    const rules: TreasuryPolicyRules = { requireApprovalOverMinor: 10000 };
    const result = evaluatePayoutRisk(
      { ...baseInput, amountMinor: 10000 },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });

  it("returns CLEAR when allowed provider matches", () => {
    const rules: TreasuryPolicyRules = { allowedProviders: ["CIRCLE", "STRIPE"] };
    const result = evaluatePayoutRisk(baseInput, rules, zeroStats);
    expect(result.riskStatus).toBe("CLEAR");
  });

  it("returns CLEAR when vendor is on allowlist", () => {
    const rules: TreasuryPolicyRules = { vendorAllowlist: ["vendor_1", "vendor_2"] };
    const result = evaluatePayoutRisk(baseInput, rules, zeroStats);
    expect(result.riskStatus).toBe("CLEAR");
  });

  it("returns CLEAR when country allowlist is configured but no vendor country", () => {
    const rules: TreasuryPolicyRules = { countryAllowlist: ["US"] };
    const result = evaluatePayoutRisk(
      { ...baseInput, vendorCountry: null },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });
});

describe("evaluatePayoutRisk - REQUIRES_APPROVAL", () => {
  it("requires approval when amount exceeds threshold", () => {
    const rules: TreasuryPolicyRules = { requireApprovalOverMinor: 5000 };
    const result = evaluatePayoutRisk(
      { ...baseInput, amountMinor: 5001 },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("REQUIRES_APPROVAL");
    expect(result.requiresApproval).toBe(true);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain("5001");
    expect(result.reasons[0]).toContain("5000");
  });

  it("requires approval for large payout with default rules", () => {
    const rules = resolveRules(null);
    const result = evaluatePayoutRisk(
      { ...baseInput, amountMinor: 600000 },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("REQUIRES_APPROVAL");
    expect(result.requiresApproval).toBe(true);
  });

  it("returns CLEAR when below default approval threshold", () => {
    const rules = resolveRules(null);
    const result = evaluatePayoutRisk(
      { ...baseInput, amountMinor: 250000 },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });
});

describe("evaluatePayoutRisk - BLOCKED", () => {
  it("blocks when provider is not allowed", () => {
    const rules: TreasuryPolicyRules = { allowedProviders: ["STRIPE"] };
    const result = evaluatePayoutRisk(baseInput, rules, zeroStats);
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons[0]).toContain("not allowed");
  });

  it("blocks when rail is not allowed", () => {
    const rules: TreasuryPolicyRules = { allowedRails: ["ACH"] };
    const result = evaluatePayoutRisk(baseInput, rules, zeroStats);
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons[0]).toContain("not allowed");
  });

  it("blocks when vendor is not on allowlist", () => {
    const rules: TreasuryPolicyRules = { vendorAllowlist: ["vendor_other"] };
    const result = evaluatePayoutRisk(baseInput, rules, zeroStats);
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons[0]).toContain("allowlist");
  });

  it("blocks when vendor has no id and allowlist is set", () => {
    const rules: TreasuryPolicyRules = { vendorAllowlist: ["vendor_1"] };
    const result = evaluatePayoutRisk(
      { ...baseInput, vendorId: null },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("BLOCKED");
  });

  it("blocks when country is not on allowlist", () => {
    const rules: TreasuryPolicyRules = { countryAllowlist: ["US"] };
    const result = evaluatePayoutRisk(
      { ...baseInput, vendorCountry: "RU" },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons[0]).toContain("Country");
  });

  it("blocks when daily org limit exceeded", () => {
    const rules: TreasuryPolicyRules = { dailyLimitMinor: 100000 };
    const stats = { ...zeroStats, orgDailyAmountMinor: 95000 };
    const result = evaluatePayoutRisk(
      { ...baseInput, amountMinor: 10000 },
      rules,
      stats
    );
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons[0]).toContain("daily limit");
  });

  it("blocks when weekly org limit exceeded", () => {
    const rules: TreasuryPolicyRules = { weeklyLimitMinor: 500000 };
    const stats = { ...zeroStats, orgWeeklyAmountMinor: 499000 };
    const result = evaluatePayoutRisk(
      { ...baseInput, amountMinor: 2000 },
      rules,
      stats
    );
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons[0]).toContain("weekly limit");
  });

  it("blocks when monthly org limit exceeded", () => {
    const rules: TreasuryPolicyRules = { monthlyLimitMinor: 1000000 };
    const stats = { ...zeroStats, orgMonthlyAmountMinor: 999999 };
    const result = evaluatePayoutRisk(
      { ...baseInput, amountMinor: 10 },
      rules,
      stats
    );
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons[0]).toContain("monthly limit");
  });

  it("blocks when per-vendor daily limit exceeded", () => {
    const rules: TreasuryPolicyRules = { perVendorDailyLimitMinor: 50000 };
    const stats = { ...zeroStats, vendorDailyAmountMinor: 45000 };
    const result = evaluatePayoutRisk(
      { ...baseInput, amountMinor: 6000 },
      rules,
      stats
    );
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons[0]).toContain("Vendor daily limit");
  });

  it("blocks when max payouts per day exceeded", () => {
    const rules: TreasuryPolicyRules = { maxPayoutsPerDay: 5 };
    const stats = { ...zeroStats, orgDailyCount: 5 };
    const result = evaluatePayoutRisk(baseInput, rules, stats);
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons[0]).toContain("payout count");
  });

  it("blocks when max payouts per vendor per day exceeded", () => {
    const rules: TreasuryPolicyRules = { maxPayoutsPerVendorPerDay: 2 };
    const stats = { ...zeroStats, vendorDailyCount: 2 };
    const result = evaluatePayoutRisk(baseInput, rules, stats);
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons[0]).toContain("Vendor daily payout count");
  });

  it("accumulates multiple block reasons", () => {
    const rules: TreasuryPolicyRules = {
      dailyLimitMinor: 100,
      allowedProviders: ["STRIPE"],
    };
    const result = evaluatePayoutRisk(baseInput, rules, zeroStats);
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});

describe("evaluatePayoutRisk - edge cases", () => {
  it("handles bigint amountMinor", () => {
    const rules: TreasuryPolicyRules = { requireApprovalOverMinor: 100 };
    const result = evaluatePayoutRisk(
      { ...baseInput, amountMinor: 200n },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("REQUIRES_APPROVAL");
  });

  it("skips vendor checks when no vendorId", () => {
    const rules: TreasuryPolicyRules = {
      perVendorDailyLimitMinor: 100,
      maxPayoutsPerVendorPerDay: 1,
    };
    const result = evaluatePayoutRisk(
      { ...baseInput, vendorId: null },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });

  it("case-insensitive provider check", () => {
    const rules: TreasuryPolicyRules = { allowedProviders: ["CIRCLE"] };
    const result = evaluatePayoutRisk(
      { ...baseInput, provider: "circle" },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });

  it("case-insensitive rail check", () => {
    const rules: TreasuryPolicyRules = { allowedRails: ["BANK_WIRE"] };
    const result = evaluatePayoutRisk(
      { ...baseInput, payoutRail: "bank_wire" },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });

  it("case-insensitive country check", () => {
    const rules: TreasuryPolicyRules = { countryAllowlist: ["US"] };
    const result = evaluatePayoutRisk(
      { ...baseInput, vendorCountry: "us" },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });

  it("block takes priority over approval requirement", () => {
    const rules: TreasuryPolicyRules = {
      allowedProviders: ["STRIPE"],
      requireApprovalOverMinor: 1,
    };
    const result = evaluatePayoutRisk(
      { ...baseInput, amountMinor: 5000 },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.requiresApproval).toBe(false);
  });
});

describe("enforcePayoutPolicyOrThrow", () => {
  it("throws for BLOCKED status", () => {
    expect(() =>
      enforcePayoutPolicyOrThrow({
        riskStatus: "BLOCKED" as never,
        reasons: ["Test reason"],
        requiresApproval: false,
      })
    ).toThrow(TreasuryPolicyViolationError);
  });

  it("includes reasons in error", () => {
    try {
      enforcePayoutPolicyOrThrow({
        riskStatus: "BLOCKED" as never,
        reasons: ["Reason A", "Reason B"],
        requiresApproval: false,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(TreasuryPolicyViolationError);
      expect((e as TreasuryPolicyViolationError).reasons).toEqual(["Reason A", "Reason B"]);
    }
  });

  it("does not throw for CLEAR", () => {
    expect(() =>
      enforcePayoutPolicyOrThrow({
        riskStatus: "CLEAR" as never,
        reasons: [],
        requiresApproval: false,
      })
    ).not.toThrow();
  });

  it("does not throw for REQUIRES_APPROVAL", () => {
    expect(() =>
      enforcePayoutPolicyOrThrow({
        riskStatus: "REQUIRES_APPROVAL" as never,
        reasons: ["needs approval"],
        requiresApproval: true,
      })
    ).not.toThrow();
  });
});
