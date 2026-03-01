/**
 * Server-side environment validation with zod.
 * Use env.* in server code instead of process.env for validated config.
 * Fails fast at first import with clear error messages.
 */
import { z } from "zod";

function normalizeAppUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(/\/+$/, "") || undefined;
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? normalizeAppUrl(v.trim()) || v.trim() : undefined))
    .refine((v) => !v || /^https?:\/\//.test(v), "NEXT_PUBLIC_APP_URL must be http(s) URL when set"),
  SOLANA_CLUSTER: z
    .string()
    .optional()
    .transform((v) => (v === "mainnet-beta" ? "mainnet-beta" : "devnet")),
  SOLANA_RPC_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined))
    .refine((v) => !v || v.startsWith("https://"), "SOLANA_RPC_URL must be https when set"),
  SOLANA_RPC_URL_MAINNET: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined))
    .refine((v) => !v || v.startsWith("https://"), "SOLANA_RPC_URL_MAINNET must be https when set"),
  SOLANA_RPC_BASIC_USER: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  SOLANA_RPC_BASIC_PASS: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  ORG_CREATE_FEE_SOL: z.string().optional().default("0.006"),
  ORG_CREATE_TREASURY_PUBKEY: z
    .string()
    .optional()
    .default("HSArdamD23MAzpSFC6Ls9EeexzGH6ukNkceqwzjGCLGp"),
  RECEIPT_STORAGE_DIR: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  TREASURY_KEYPAIR_JSON: z.string().optional(),
  DEMO_MODE: z.enum(["true", "false", "1", "0", ""]).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  TRUST_PROXY: z.enum(["1", "0", "true", "false", ""]).optional().transform((v) => v === "1" || v === "true"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  REDIS_URL: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  CRON_SECRET: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  HEALTH_ADMIN_TOKEN: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  // QuickBooks Online (Day 27)
  QUICKBOOKS_CLIENT_ID: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  QUICKBOOKS_CLIENT_SECRET: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  ENCRYPTION_KEY: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  CIRCLE_API_KEY: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  CIRCLE_ENV: z
    .string()
    .optional()
    .transform((v) => (v === "production" ? "production" : "sandbox")),
  CIRCLE_WEBHOOK_SECRET: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  INTERNAL_JOB_SECRET: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  SLACK_TREASURY_WEBHOOK_URL: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  NOTIFICATION_EMAIL_FROM: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
  INTERNAL_NOTIFICATIONS_ENABLED: z.enum(["true", "false", ""]).optional().default("false"),
  ENABLE_ACH_PAYOUTS: z.enum(["true", "false", "1", "0", ""]).optional().default("false"),
  ENABLE_LOCAL_PAYOUTS: z.enum(["true", "false", "1", "0", ""]).optional().default("false"),
  ENABLE_ONCHAIN_RECONCILIATION: z.enum(["true", "false", "1", "0", ""]).optional().default("false"),
  HOT_WALLET_KEYPAIR_JSON: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined)),
});

const raw = {
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  SOLANA_CLUSTER: process.env.SOLANA_CLUSTER,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || undefined,
  SOLANA_RPC_URL_MAINNET: process.env.SOLANA_RPC_URL_MAINNET || process.env.SOLANA_RPC_URL || undefined,
  SOLANA_RPC_BASIC_USER: process.env.SOLANA_RPC_BASIC_USER || undefined,
  SOLANA_RPC_BASIC_PASS: process.env.SOLANA_RPC_BASIC_PASS || undefined,
  ORG_CREATE_FEE_SOL: process.env.ORG_CREATE_FEE_SOL,
  ORG_CREATE_TREASURY_PUBKEY: process.env.ORG_CREATE_TREASURY_PUBKEY,
  RECEIPT_STORAGE_DIR: process.env.RECEIPT_STORAGE_DIR,
  TREASURY_KEYPAIR_JSON: process.env.TREASURY_KEYPAIR_JSON,
  DEMO_MODE: process.env.DEMO_MODE,
  LOG_LEVEL: process.env.LOG_LEVEL,
  TRUST_PROXY: process.env.TRUST_PROXY,
  NODE_ENV: process.env.NODE_ENV,
  REDIS_URL: process.env.REDIS_URL,
  CRON_SECRET: process.env.CRON_SECRET,
  HEALTH_ADMIN_TOKEN: process.env.HEALTH_ADMIN_TOKEN,
  QUICKBOOKS_CLIENT_ID: process.env.QUICKBOOKS_CLIENT_ID,
  QUICKBOOKS_CLIENT_SECRET: process.env.QUICKBOOKS_CLIENT_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  CIRCLE_API_KEY: process.env.CIRCLE_API_KEY,
  CIRCLE_ENV: process.env.CIRCLE_ENV,
  CIRCLE_WEBHOOK_SECRET: process.env.CIRCLE_WEBHOOK_SECRET,
  INTERNAL_JOB_SECRET: process.env.INTERNAL_JOB_SECRET,
  SLACK_TREASURY_WEBHOOK_URL: process.env.SLACK_TREASURY_WEBHOOK_URL,
  NOTIFICATION_EMAIL_FROM: process.env.NOTIFICATION_EMAIL_FROM,
  INTERNAL_NOTIFICATIONS_ENABLED: process.env.INTERNAL_NOTIFICATIONS_ENABLED,
  ENABLE_ACH_PAYOUTS: process.env.ENABLE_ACH_PAYOUTS,
  ENABLE_LOCAL_PAYOUTS: process.env.ENABLE_LOCAL_PAYOUTS,
  ENABLE_ONCHAIN_RECONCILIATION: process.env.ENABLE_ONCHAIN_RECONCILIATION,
  HOT_WALLET_KEYPAIR_JSON: process.env.HOT_WALLET_KEYPAIR_JSON,
};

const parsed = envSchema.safeParse(raw);

if (parsed.success && parsed.data.NODE_ENV === "production") {
  const prod = parsed.data;
  const isDemoOnly = prod.DEMO_MODE === "1" || prod.DEMO_MODE === "true";
  if (!prod.NEXT_PUBLIC_APP_URL) {
    console.error("[env] Invalid environment: NEXT_PUBLIC_APP_URL is required in production");
    process.exit(1);
  }
  if (!isDemoOnly) {
    if (!prod.ENCRYPTION_KEY || prod.ENCRYPTION_KEY.length < 64) {
      console.error("[env] Invalid environment: ENCRYPTION_KEY (64-char hex) is required in production");
      process.exit(1);
    }
    if (!prod.CRON_SECRET || prod.CRON_SECRET.length < 16) {
      console.error("[env] Invalid environment: CRON_SECRET (min 16 chars) is required in production");
      process.exit(1);
    }
  }
}

if (!parsed.success) {
  const errors = parsed.error.flatten?.()?.fieldErrors ?? {};
  const msg = Object.entries(errors)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("; ");
  console.error("[env] Invalid environment:", msg);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
