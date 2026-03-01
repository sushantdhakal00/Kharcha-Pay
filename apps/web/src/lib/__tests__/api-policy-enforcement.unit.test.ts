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
import {
  approvalRequestedDedupKey,
  approvalDecidedDedupKey,
  policyBlockedDedupKey,
  payoutCreatedDedupKey,
} from "../fiat/treasury-events";

const zeroStats: HistoricalStats = {
  orgDailyAmountMinor: 0,
  orgWeeklyAmountMinor: 0,
  orgMonthlyAmountMinor: 0,
  orgDailyCount: 0,
  vendorDailyAmountMinor: 0,
  vendorDailyCount: 0,
};

describe("API policy enforcement - full evaluation pipeline", () => {
  const input: PolicyEvaluationInput = {
    amountMinor: 100000,
    currency: "USD",
    vendorId: "v1",
    payoutRail: "BANK_WIRE",
    provider: "CIRCLE",
  };

  it("default policy allows normal payouts", () => {
    const rules = resolveRules(null);
    const result = evaluatePayoutRisk(input, rules, zeroStats);
    expect(result.riskStatus).toBe("CLEAR");
  });

  it("default policy requires approval for high value", () => {
    const rules = resolveRules(null);
    const result = evaluatePayoutRisk(
      { ...input, amountMinor: 600000 },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("REQUIRES_APPROVAL");
  });

  it("custom policy can lower approval threshold", () => {
    const rules = resolveRules({ rules: { requireApprovalOverMinor: 1000 } });
    const result = evaluatePayoutRisk(
      { ...input, amountMinor: 2000 },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("REQUIRES_APPROVAL");
  });

  it("custom policy can raise approval threshold", () => {
    const rules = resolveRules({
      rules: { requireApprovalOverMinor: 10000000, perVendorDailyLimitMinor: 20000000 },
    });
    const result = evaluatePayoutRisk(
      { ...input, amountMinor: 5000000 },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });
});

describe("API policy enforcement - velocity checks", () => {
  it("allows first payout of the day", () => {
    const rules: TreasuryPolicyRules = { maxPayoutsPerDay: 10, dailyLimitMinor: 1000000 };
    const result = evaluatePayoutRisk(
      { amountMinor: 50000, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });

  it("blocks payout when daily count at limit", () => {
    const rules: TreasuryPolicyRules = { maxPayoutsPerDay: 3 };
    const stats = { ...zeroStats, orgDailyCount: 3 };
    const result = evaluatePayoutRisk(
      { amountMinor: 100, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      rules,
      stats
    );
    expect(result.riskStatus).toBe("BLOCKED");
  });

  it("blocks payout when daily amount at limit", () => {
    const rules: TreasuryPolicyRules = { dailyLimitMinor: 1000000 };
    const stats = { ...zeroStats, orgDailyAmountMinor: 990001 };
    const result = evaluatePayoutRisk(
      { amountMinor: 10000, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      rules,
      stats
    );
    expect(result.riskStatus).toBe("BLOCKED");
  });

  it("allows payout when daily amount just below limit", () => {
    const rules: TreasuryPolicyRules = { dailyLimitMinor: 1000000 };
    const stats = { ...zeroStats, orgDailyAmountMinor: 989999 };
    const result = evaluatePayoutRisk(
      { amountMinor: 10000, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      rules,
      stats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });
});

describe("API policy enforcement - vendor checks", () => {
  it("blocks vendor not on allowlist", () => {
    const rules: TreasuryPolicyRules = { vendorAllowlist: ["allowed_vendor"] };
    const result = evaluatePayoutRisk(
      { amountMinor: 100, currency: "USD", vendorId: "unknown_vendor", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("BLOCKED");
  });

  it("passes vendor on allowlist", () => {
    const rules: TreasuryPolicyRules = { vendorAllowlist: ["allowed_vendor"] };
    const result = evaluatePayoutRisk(
      { amountMinor: 100, currency: "USD", vendorId: "allowed_vendor", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });

  it("skips vendor allowlist check when empty array", () => {
    const rules: TreasuryPolicyRules = { vendorAllowlist: [] };
    const result = evaluatePayoutRisk(
      { amountMinor: 100, currency: "USD", vendorId: "any_vendor", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
  });
});

describe("API policy enforcement - dedup key uniqueness", () => {
  it("approval and payout created dedup keys are different", () => {
    const approvalKey = approvalRequestedDedupKey("intent_1");
    const createdKey = payoutCreatedDedupKey("intent_1");
    expect(approvalKey).not.toBe(createdKey);
  });

  it("blocked and approval dedup keys are different", () => {
    const blockedKey = policyBlockedDedupKey("intent_1");
    const approvalKey = approvalRequestedDedupKey("intent_1");
    expect(blockedKey).not.toBe(approvalKey);
  });

  it("approve and reject decisions have different keys", () => {
    const a = approvalDecidedDedupKey("i1", "APPROVED");
    const r = approvalDecidedDedupKey("i1", "REJECTED");
    expect(a).not.toBe(r);
  });
});

describe("API policy enforcement - error shape", () => {
  it("TreasuryPolicyViolationError has correct code and reasons", () => {
    const err = new TreasuryPolicyViolationError(["reason1", "reason2"]);
    expect(err.code).toBe("TREASURY_POLICY_VIOLATION");
    expect(err.reasons).toEqual(["reason1", "reason2"]);
    expect(err.message).toContain("reason1");
    expect(err.message).toContain("reason2");
  });

  it("TreasuryPolicyViolationError is an Error instance", () => {
    const err = new TreasuryPolicyViolationError(["test"]);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("API policy enforcement - mixed scenarios", () => {
  it("multiple limits hit simultaneously - all reasons captured", () => {
    const rules: TreasuryPolicyRules = {
      dailyLimitMinor: 100,
      weeklyLimitMinor: 100,
      monthlyLimitMinor: 100,
    };
    const stats = { ...zeroStats, orgDailyAmountMinor: 100, orgWeeklyAmountMinor: 100, orgMonthlyAmountMinor: 100 };
    const result = evaluatePayoutRisk(
      { amountMinor: 50, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      rules,
      stats
    );
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.reasons.length).toBe(3);
  });

  it("approval threshold check only runs if not blocked", () => {
    const rules: TreasuryPolicyRules = {
      requireApprovalOverMinor: 100,
      allowedProviders: ["STRIPE"],
    };
    const result = evaluatePayoutRisk(
      { amountMinor: 500, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      rules,
      zeroStats
    );
    expect(result.riskStatus).toBe("BLOCKED");
    expect(result.requiresApproval).toBe(false);
  });
});
