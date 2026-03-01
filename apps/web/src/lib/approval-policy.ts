/**
 * Compute requiredApprovals for a request from org policy tiers.
 * Tiers must be sorted by minAmountMinor ascending.
 * Returns the requiredApprovals of the highest tier where tier.minAmountMinor <= amountMinor.
 * Default: 1 if no policy or no matching tier.
 */
export function getRequiredApprovalsFromTiers(
  amountMinor: bigint,
  tiers: { minAmountMinor: bigint; requiredApprovals: number }[]
): number {
  if (!tiers.length) return 1;
  const sorted = [...tiers].sort(
    (a, b) => (a.minAmountMinor < b.minAmountMinor ? -1 : a.minAmountMinor > b.minAmountMinor ? 1 : 0)
  );
  let required = 1;
  for (const tier of sorted) {
    if (tier.minAmountMinor <= amountMinor) {
      required = tier.requiredApprovals;
    }
  }
  return required;
}
