import { z } from "zod";

export const orgCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, numbers, hyphen only"),
  currency: z.string().length(3).optional().default("USD"),
});

export const orgSetupCreateSchema = orgCreateSchema.extend({
  defaultCurrency: z.string().length(3).optional().default("USD"),
  orgSize: z.enum(["1-10", "11-50", "51-200", "200+"]).optional(),
  country: z.string().max(100).optional(),
  timezone: z.string().max(60).optional(),
  expectedMonthlySpendRange: z.string().max(100).optional(),
  primaryUseCase: z
    .enum(["expense_approvals", "vendor_payments", "audit_compliance"])
    .optional(),
  referral: z.string().max(200).optional(),
});

export type OrgSetupCreateInput = z.infer<typeof orgSetupCreateSchema>;

export const memberAddSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(["ADMIN", "APPROVER", "STAFF", "AUDITOR"]),
});

export const departmentCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
});

const AMOUNT_MAX = 1e15;

export const budgetUpsertSchema = z.object({
  departmentId: z.string().min(1, "Department is required").max(100),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amountMinor: z.number().int().min(0).max(AMOUNT_MAX),
  currency: z.string().length(3).default("NPR"),
});

export type OrgCreateInput = z.infer<typeof orgCreateSchema>;
export type MemberAddInput = z.infer<typeof memberAddSchema>;
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;
export type BudgetUpsertInput = z.infer<typeof budgetUpsertSchema>;
