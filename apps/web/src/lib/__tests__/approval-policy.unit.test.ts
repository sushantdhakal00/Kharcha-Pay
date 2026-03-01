import { describe, it, expect } from "vitest";
import { getRequiredApprovalsFromTiers } from "../approval-policy";

describe("getRequiredApprovalsFromTiers", () => {
  it("returns 1 when no tiers", () => {
    expect(getRequiredApprovalsFromTiers(BigInt(1000), [])).toBe(1);
  });

  it("returns required approvals for matching tier", () => {
    const tiers = [
      { minAmountMinor: BigInt(0), requiredApprovals: 1 },
      { minAmountMinor: BigInt(500000), requiredApprovals: 2 },
    ];
    expect(getRequiredApprovalsFromTiers(BigInt(100), tiers)).toBe(1);
    expect(getRequiredApprovalsFromTiers(BigInt(500000), tiers)).toBe(2);
    expect(getRequiredApprovalsFromTiers(BigInt(1000000), tiers)).toBe(2);
  });

  it("sorts tiers by minAmountMinor ascending", () => {
    const tiers = [
      { minAmountMinor: BigInt(500000), requiredApprovals: 2 },
      { minAmountMinor: BigInt(0), requiredApprovals: 1 },
    ];
    expect(getRequiredApprovalsFromTiers(BigInt(100), tiers)).toBe(1);
    expect(getRequiredApprovalsFromTiers(BigInt(600000), tiers)).toBe(2);
  });
});
