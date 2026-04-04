import { z } from "zod";

const tierSchema = z.object({
  minAmountMinor: z.union([
    z.number().int().min(0),
    z.string().regex(/^\d+$/).transform(Number),
  ]),
  requiredApprovals: z.number().int().min(1).max(5),
});

export const approvalPolicyUpsertSchema = z
  .object({
    tiers: z
      .array(tierSchema)
      .length(2, "Exactly 2 tiers required")
      .refine(
        (tiers) => BigInt(tiers[0].minAmountMinor) <= BigInt(tiers[1].minAmountMinor),
        "Tier 1 minAmountMinor must be <= Tier 2 minAmountMinor"
      ),
  })
  .strict();

export type ApprovalPolicyUpsertInput = z.infer<typeof approvalPolicyUpsertSchema>;
