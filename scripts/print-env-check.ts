#!/usr/bin/env npx tsx
/**
 * Validates presence of required env vars (without printing values).
 * Exits non-zero if any required var is missing.
 * Usage: npx tsx scripts/print-env-check.ts
 */
const REQUIRED = [
  "DATABASE_URL",
  "JWT_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "ENCRYPTION_KEY",
  "CRON_SECRET",
] as const;

const OPTIONAL = [
  "REDIS_URL",
  "QUICKBOOKS_CLIENT_ID",
  "QUICKBOOKS_CLIENT_SECRET",
  "HEALTH_ADMIN_TOKEN",
] as const;

function has(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

let failed = false;
console.log("Env check:");
for (const name of REQUIRED) {
  const ok = has(name);
  if (!ok) {
    console.error(`  MISSING (required): ${name}`);
    failed = true;
  } else {
    console.log(`  OK: ${name}`);
  }
}
for (const name of OPTIONAL) {
  const ok = has(name);
  console.log(`  ${ok ? "OK" : "—"}: ${name} (optional)`);
}

if (failed) {
  process.exit(1);
}
