-- Day 42: Treasury Event Bus (append-only, replay-safe)

CREATE TYPE "TreasuryEventType" AS ENUM (
  'PAYOUT_CREATED',
  'PAYOUT_STATUS_CHANGED',
  'PAYOUT_COMPLETED',
  'PAYOUT_FAILED',
  'PAYOUT_FUNDED_ONCHAIN',
  'LEDGER_ENTRY_WRITTEN',
  'ALERT_RAISED'
);

CREATE TABLE "TreasuryEvent" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "type" "TreasuryEventType" NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "dedupKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TreasuryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TreasuryEvent_orgId_dedupKey_key"
  ON "TreasuryEvent"("orgId", "dedupKey");

CREATE INDEX "TreasuryEvent_orgId_createdAt_idx"
  ON "TreasuryEvent"("orgId", "createdAt");
