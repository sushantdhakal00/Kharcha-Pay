-- Day 41: Treasury Ledger (double-entry style, append-only)

CREATE TYPE "TreasuryLedgerEntryType" AS ENUM (
  'PAYOUT_CREATED',
  'PAYOUT_FUNDED_ONCHAIN',
  'PAYOUT_PROVIDER_SUBMITTED',
  'PAYOUT_COMPLETED',
  'PAYOUT_FAILED',
  'PAYOUT_CANCELED',
  'FEE_ASSESSED',
  'FX_CONVERSION'
);

CREATE TYPE "TreasuryLedgerAccount" AS ENUM (
  'TREASURY_WALLET',
  'PROVIDER_WALLET',
  'VENDOR_PAYABLE',
  'FEES_EXPENSE',
  'CLEARING',
  'SUSPENSE'
);

CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE "TreasuryLedgerEntry" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "type" "TreasuryLedgerEntryType" NOT NULL,
  "intentId" TEXT,
  "provider" TEXT,
  "payoutRail" "PayoutMethodType",
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "amountMinor" BIGINT NOT NULL,
  "direction" "LedgerDirection" NOT NULL,
  "account" "TreasuryLedgerAccount" NOT NULL,
  "externalRef" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TreasuryLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TreasuryLedgerEntry_orgId_type_intentId_account_direction_externalRef_key"
  ON "TreasuryLedgerEntry"("orgId", "type", "intentId", "account", "direction", "externalRef");

CREATE INDEX "TreasuryLedgerEntry_orgId_createdAt_idx"
  ON "TreasuryLedgerEntry"("orgId", "createdAt");

CREATE INDEX "TreasuryLedgerEntry_orgId_intentId_idx"
  ON "TreasuryLedgerEntry"("orgId", "intentId");

CREATE INDEX "TreasuryLedgerEntry_orgId_account_createdAt_idx"
  ON "TreasuryLedgerEntry"("orgId", "account", "createdAt");
