import { describe, it, expect } from "vitest";
import {
  checkReceiptRequired,
  checkOverBudget,
  type SpendPolicyInput,
} from "../spend-policy-checks";

const defaultPolicy: SpendPolicyInput = {
  requireReceiptForPayment: true,
  receiptRequiredAboveMinor: BigInt(0),
  blockOverBudget: true,
  allowAdminOverrideOverBudget: false,
};

describe("checkReceiptRequired", () => {
  it("allows when policy does not require receipt", () => {
    const policy = { ...defaultPolicy, requireReceiptForPayment: false };
    expect(checkReceiptRequired(policy, BigInt(1000), 0).allowed).toBe(true);
  });

  it("allows when amount below threshold", () => {
    const policy = { ...defaultPolicy, receiptRequiredAboveMinor: BigInt(10000) };
    expect(checkReceiptRequired(policy, BigInt(5000), 0).allowed).toBe(true);
  });

  it("allows when receipt attached", () => {
    expect(checkReceiptRequired(defaultPolicy, BigInt(1000), 1).allowed).toBe(true);
    expect(checkReceiptRequired(defaultPolicy, BigInt(1000), 2).allowed).toBe(true);
  });

  it("blocks when amount >= threshold and no receipt", () => {
    const result = checkReceiptRequired(defaultPolicy, BigInt(1000), 0);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("RECEIPT_REQUIRED");
  });
});

describe("checkOverBudget", () => {
  it("allows when policy does not block over budget", () => {
    const policy = { ...defaultPolicy, blockOverBudget: false };
    expect(checkOverBudget(policy, BigInt(0), BigInt(1000), undefined).allowed).toBe(true);
  });

  it("allows when remaining >= amount", () => {
    expect(checkOverBudget(defaultPolicy, BigInt(1000), BigInt(500), undefined).allowed).toBe(
      true
    );
  });

  it("blocks when remaining < amount and no override", () => {
    const result = checkOverBudget(defaultPolicy, BigInt(100), BigInt(500), undefined);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("OVER_BUDGET");
  });

  it("allows when remaining < amount but override note >= 5 chars", () => {
    const policy = { ...defaultPolicy, allowAdminOverrideOverBudget: true };
    expect(checkOverBudget(policy, BigInt(100), BigInt(500), "Admin approved").allowed).toBe(
      true
    );
  });

  it("blocks when override note too short", () => {
    const policy = { ...defaultPolicy, allowAdminOverrideOverBudget: true };
    const result = checkOverBudget(policy, BigInt(100), BigInt(500), "no");
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("OVER_BUDGET");
  });
});
