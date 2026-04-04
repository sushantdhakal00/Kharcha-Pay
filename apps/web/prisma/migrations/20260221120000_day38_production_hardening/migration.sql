-- Day 38: Production hardening

-- Idempotency + retry fields on TreasuryPayoutIntent
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "lastStatusRefreshAt" TIMESTAMP(3);

-- Unique constraint for idempotency per org
CREATE UNIQUE INDEX "TreasuryPayoutIntent_orgId_idempotencyKey_key" ON "TreasuryPayoutIntent"("orgId", "idempotencyKey");

-- Processed webhook event dedup table (replay-safe)
CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "orgId" TEXT,
    "payloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProcessedWebhookEvent_type_idx" ON "ProcessedWebhookEvent"("type");

-- Treasury audit log for payout lifecycle events
CREATE TABLE "TreasuryAuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TreasuryAuditLog_orgId_idx" ON "TreasuryAuditLog"("orgId");
CREATE INDEX "TreasuryAuditLog_entityType_entityId_idx" ON "TreasuryAuditLog"("entityType", "entityId");
CREATE INDEX "TreasuryAuditLog_action_idx" ON "TreasuryAuditLog"("action");
