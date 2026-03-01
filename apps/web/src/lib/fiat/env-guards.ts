export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateProductionEnv(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required");
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters");
  }

  if (isProduction) {
    if (!process.env.NEXT_PUBLIC_APP_URL) {
      errors.push("NEXT_PUBLIC_APP_URL is required in production");
    }

    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 64) {
      errors.push("ENCRYPTION_KEY (64-char hex) is required in production");
    }

    if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16) {
      errors.push("CRON_SECRET (min 16 chars) is required in production");
    }

    if (!process.env.HEALTH_ADMIN_TOKEN) {
      warnings.push("HEALTH_ADMIN_TOKEN not set — health endpoints will be open");
    }

    if (!process.env.INTERNAL_JOB_SECRET) {
      warnings.push("INTERNAL_JOB_SECRET not set — internal job endpoints unprotected");
    }

    const notificationsEnabled =
      process.env.INTERNAL_NOTIFICATIONS_ENABLED !== "false";
    if (!notificationsEnabled) {
      warnings.push(
        "INTERNAL_NOTIFICATIONS_ENABLED is false in production — no alerts will fire"
      );
    }

    if (process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1") {
      warnings.push("DEMO_MODE is enabled in production — this is dangerous");
    }

    if (process.env.ENABLE_LOCAL_PAYOUTS === "true" || process.env.ENABLE_LOCAL_PAYOUTS === "1") {
      warnings.push("ENABLE_LOCAL_PAYOUTS is enabled in production — verify this is intended");
    }

    if (!process.env.CIRCLE_API_KEY && !process.env.CIRCLE_ENV) {
      warnings.push("CIRCLE_API_KEY not configured — fiat payouts will fail");
    }

    if (!process.env.SOLANA_RPC_URL) {
      warnings.push("SOLANA_RPC_URL not set — will fall back to public devnet RPC");
    }

    const onchainReconciliation =
      process.env.ENABLE_ONCHAIN_RECONCILIATION === "true" ||
      process.env.ENABLE_ONCHAIN_RECONCILIATION === "1";
    if (!onchainReconciliation) {
      warnings.push(
        "ENABLE_ONCHAIN_RECONCILIATION is off in production — on-chain balance reconciliation disabled"
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function runEnvGuardsOnStartup(): void {
  const result = validateProductionEnv();

  for (const err of result.errors) {
    console.error(`[env-guard] ERROR: ${err}`);
  }
  for (const warn of result.warnings) {
    console.warn(`[env-guard] WARNING: ${warn}`);
  }

  if (!result.valid && process.env.NODE_ENV === "production") {
    console.error("[env-guard] FATAL: environment validation failed in production. Refusing to start.");
    process.exit(1);
  }
}
