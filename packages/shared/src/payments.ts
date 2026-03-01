import { z } from "zod";

/** Base58 public key string (32 bytes = 43–44 chars typical) */
export const pubkeySchema = z
  .string()
  .min(32, "Invalid pubkey length")
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Invalid base58 pubkey");

export const vendorSetOwnerSchema = z.object({
  ownerPubkey: pubkeySchema,
});

export const vendorStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED", "ONBOARDING", "BLOCKED", "INACTIVE"]);

/** Optional string: accepts "", null, undefined; empty/undefined → undefined (no-op), null → null (clear) */
const optionalString = (maxLen: number) =>
  z
    .union([z.string().max(maxLen), z.literal(""), z.null(), z.undefined()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" || v === null ? null : v));

/** Optional email: empty/null/undefined allowed; non-empty must be valid email */
const optionalEmail = () =>
  z.union([
    z.string().min(1).email("Invalid email format").max(200),
    z.literal("").transform(() => null),
    z.null(),
    z.undefined(),
  ]).optional();

/** Optional pubkey: empty string or null to clear; non-empty must be valid base58 */
const optionalPubkey = () =>
  z.union([
    pubkeySchema,
    z.literal("").transform(() => null),
    z.null(),
    z.undefined(),
  ]).optional();

export const vendorPatchSchema = z.object({
  name: z.string().min(1, "Name is required").max(120).optional(),
  legalName: optionalString(200),
  contactEmail: optionalEmail(),
  contactPhone: optionalString(50),
  notes: optionalString(2000),
  status: vendorStatusSchema.optional(),
  ownerPubkey: optionalPubkey(),
});

export const requestPaySchema = z.object({
  overrideNote: z.string().min(5).max(2000).optional(),
});

export type VendorSetOwnerInput = z.infer<typeof vendorSetOwnerSchema>;
export type VendorPatchInput = z.infer<typeof vendorPatchSchema>;
export type RequestPayInput = z.infer<typeof requestPaySchema>;
