import { z } from "zod";

export const vendorCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
});

const AMOUNT_MAX = 1e15; // 10^15 minor units (sane upper bound)

export const requestCreateSchema = z.object({
  departmentId: z.string().min(1, "Department is required").max(100),
  vendorId: z.string().min(1, "Vendor is required").max(100),
  title: z.string().min(1, "Title is required").max(200),
  purpose: z.string().min(1, "Purpose is required").max(2000),
  category: z.string().min(1, "Category is required").max(80),
  amountMinor: z.union([
    z.number().int().min(0).max(AMOUNT_MAX),
    z.string().regex(/^\d+$/).transform((s) => parseInt(s, 10)).refine((n) => n >= 0 && n <= AMOUNT_MAX, "Amount exceeds maximum"),
  ]),
  currency: z.string().length(3).default("NPR"),
});

export const requestPatchSchema = z.object({
  departmentId: z.string().min(1).max(100).optional(),
  vendorId: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(200).optional(),
  purpose: z.string().min(1).max(2000).optional(),
  category: z.string().min(1).max(80).optional(),
  amountMinor: z.union([
    z.number().int().min(0).max(AMOUNT_MAX),
    z.string().regex(/^\d+$/).transform((s) => parseInt(s, 10)).refine((n) => n >= 0 && n <= AMOUNT_MAX, "Amount exceeds maximum"),
  ]).optional(),
  currency: z.string().length(3).optional(),
});

export const requestSubmitSchema = z.object({});

export const requestDecideSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(1000).optional(),
});

export const yearMonthQuerySchema = z.object({
  year: z.string().regex(/^\d{4}$/).transform(Number),
  month: z.string().regex(/^(1[0-2]|[1-9])$/).transform(Number).refine((m) => m >= 1 && m <= 12),
});

export type VendorCreateInput = z.infer<typeof vendorCreateSchema>;
export type RequestCreateInput = z.infer<typeof requestCreateSchema>;
export type RequestPatchInput = z.infer<typeof requestPatchSchema>;
export type RequestDecideInput = z.infer<typeof requestDecideSchema>;
