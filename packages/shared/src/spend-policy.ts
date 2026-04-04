import { z } from "zod";

export const spendPolicyUpsertSchema = z.object({
  requireReceiptForPayment: z.boolean(),
  receiptRequiredAboveMinor: z
    .union([z.number().int().min(0), z.string().regex(/^\d+$/).transform((s) => parseInt(s, 10))])
    .refine((n) => n >= 0, "receiptRequiredAboveMinor must be >= 0"),
  blockOverBudget: z.boolean(),
  allowAdminOverrideOverBudget: z.boolean(),
});

export type SpendPolicyUpsertInput = z.infer<typeof spendPolicyUpsertSchema>;
