import { z } from "zod";

export const initMintBodySchema = z.object({
  withAuditor: z.boolean().optional().default(false),
});

export const initAccountsBodySchema = z.object({});

export const amountMinorBodySchema = z.object({
  amountMinor: z.union([
    z.number().int().min(0),
    z.string().regex(/^\d+$/).transform(Number),
  ]),
});

export const applyPendingBodySchema = z.object({
  account: z.enum(["treasury", "vendor"]),
});

export type InitMintBody = z.infer<typeof initMintBodySchema>;
export type AmountMinorBody = z.infer<typeof amountMinorBodySchema>;
export type ApplyPendingBody = z.infer<typeof applyPendingBodySchema>;
