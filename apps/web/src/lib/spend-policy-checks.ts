/**
 * Pure spend-policy check logic for unit testing.
 * Matches the enforcement in the pay route.
 */
export interface SpendPolicyInput {
  requireReceiptForPayment: boolean;
  receiptRequiredAboveMinor: bigint;
  blockOverBudget: boolean;
  allowAdminOverrideOverBudget: boolean;
}

export interface CheckResult {
  allowed: boolean;
  code?: "RECEIPT_REQUIRED" | "OVER_BUDGET";
}

/**
 * Check if receipt is required and present.
 */
export function checkReceiptRequired(
  policy: SpendPolicyInput,
  amountMinor: bigint,
  receiptCount: number
): CheckResult {
  if (!policy.requireReceiptForPayment) return { allowed: true };
  if (amountMinor < policy.receiptRequiredAboveMinor) return { allowed: true };
  if (receiptCount >= 1) return { allowed: true };
  return { allowed: false, code: "RECEIPT_REQUIRED" };
}

/**
 * Check if payment would exceed budget and if override is allowed.
 */
export function checkOverBudget(
  policy: SpendPolicyInput,
  remainingMinor: bigint,
  amountMinor: bigint,
  overrideNote: string | undefined
): CheckResult {
  if (!policy.blockOverBudget) return { allowed: true };
  if (remainingMinor >= amountMinor) return { allowed: true };
  if (policy.allowAdminOverrideOverBudget && overrideNote && overrideNote.trim().length >= 5) {
    return { allowed: true };
  }
  return { allowed: false, code: "OVER_BUDGET" };
}
