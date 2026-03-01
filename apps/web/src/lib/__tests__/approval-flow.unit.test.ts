import { describe, it, expect } from "vitest";
import {
  approvalRequestedDedupKey,
  approvalDecidedDedupKey,
  policyBlockedDedupKey,
} from "../fiat/treasury-events";
import {
  evaluatePayoutRisk,
  enforcePayoutPolicyOrThrow,
  TreasuryPolicyViolationError,
  type TreasuryPolicyRules,
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

describe("approval dedup keys", () => {
  it("approvalRequestedDedupKey includes intent id", () => {
    const key = approvalRequestedDedupKey("intent_1");
    expect(key).toBe("payout:intent_1:approval_requested");
  });

  it("approvalDecidedDedupKey includes intent and decision", () => {
    const key1 = approvalDecidedDedupKey("intent_1", "APPROVED");
    const key2 = approvalDecidedDedupKey("intent_1", "REJECTED");
    expect(key1).toBe("payout:intent_1:approval:APPROVED");
    expect(key2).toBe("payout:intent_1:approval:REJECTED");
    expect(key1).not.toBe(key2);
  });

  it("policyBlockedDedupKey includes intent id", () => {
    const key = policyBlockedDedupKey("intent_1");
    expect(key).toBe("payout:intent_1:policy_blocked");
  });

  it("different intents produce different keys", () => {
    const a = approvalRequestedDedupKey("a");
    const b = approvalRequestedDedupKey("b");
    expect(a).not.toBe(b);
  });
});

describe("approval flow - evaluation gating", () => {
  const approvalRules: TreasuryPolicyRules = {
    requireApprovalOverMinor: 100000,
  };

  it("payout below threshold proceeds without approval", () => {
    const result = evaluatePayoutRisk(
      { amountMinor: 50000, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      approvalRules,
      zeroStats
    );
    expect(result.riskStatus).toBe("CLEAR");
    expect(result.requiresApproval).toBe(false);
  });

  it("payout above threshold requires approval", () => {
    const result = evaluatePayoutRisk(
      { amountMinor: 200000, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      approvalRules,
      zeroStats
    );
    expect(result.riskStatus).toBe("REQUIRES_APPROVAL");
    expect(result.requiresApproval).toBe(true);
  });

  it("enforcePayoutPolicyOrThrow does not throw for approval-required", () => {
    const result = evaluatePayoutRisk(
      { amountMinor: 200000, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      approvalRules,
      zeroStats
    );
    expect(() => enforcePayoutPolicyOrThrow(result)).not.toThrow();
  });

  it("enforcePayoutPolicyOrThrow throws for blocked", () => {
    const result = evaluatePayoutRisk(
      { amountMinor: 200000, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      { allowedProviders: ["STRIPE"] },
      zeroStats
    );
    expect(() => enforcePayoutPolicyOrThrow(result)).toThrow(TreasuryPolicyViolationError);
  });
});

describe("approval flow - idempotency logic", () => {
  it("approving twice uses same dedup key", () => {
    const key1 = approvalDecidedDedupKey("intent_x", "APPROVED");
    const key2 = approvalDecidedDedupKey("intent_x", "APPROVED");
    expect(key1).toBe(key2);
  });

  it("rejecting after approve produces different key", () => {
    const approveKey = approvalDecidedDedupKey("intent_x", "APPROVED");
    const rejectKey = approvalDecidedDedupKey("intent_x", "REJECTED");
    expect(approveKey).not.toBe(rejectKey);
  });
});

describe("approval flow - execution gating", () => {
  it("blocked payouts should not reach provider", () => {
    const rules: TreasuryPolicyRules = {
      dailyLimitMinor: 100,
    };
    const stats = { ...zeroStats, orgDailyAmountMinor: 100 };
    const result = evaluatePayoutRisk(
      { amountMinor: 50, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      rules,
      stats
    );
    expect(result.riskStatus).toBe("BLOCKED");
    expect(() => enforcePayoutPolicyOrThrow(result)).toThrow();
  });

  it("approval-required payouts should not immediately execute", () => {
    const result = evaluatePayoutRisk(
      { amountMinor: 500001, currency: "USD", vendorId: "v1", payoutRail: "BANK_WIRE", provider: "CIRCLE" },
      { requireApprovalOverMinor: 500000 },
      zeroStats
    );
    expect(result.riskStatus).toBe("REQUIRES_APPROVAL");
    expect(result.requiresApproval).toBe(true);
  });
});
