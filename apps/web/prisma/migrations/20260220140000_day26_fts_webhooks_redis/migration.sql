-- Day 26: Postgres FTS for chat search, WebhookEndpoint, WebhookDeliveryAttempt

-- ChatMessage: add generated tsvector for full-text search
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("contentText", ''))) STORED;

CREATE INDEX IF NOT EXISTS "ChatMessage_search_tsv_idx" ON "ChatMessage" USING GIN ("search_tsv");

-- WebhookEndpoint (per org)
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "secret" TEXT NOT NULL,
    "subscribedEventTypes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "lastDeliveryAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookEndpoint_orgId_idx" ON "WebhookEndpoint"("orgId");
CREATE INDEX "WebhookEndpoint_orgId_status_idx" ON "WebhookEndpoint"("orgId", "status");

-- WebhookDeliveryAttempt
CREATE TABLE "WebhookDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "outboxEventId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestHeaders" JSONB,
    "requestBody" JSONB,
    "responseStatus" INTEGER,
    "responseBodySnippet" TEXT,
    "errorMessage" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDeliveryAttempt_endpointId_idx" ON "WebhookDeliveryAttempt"("endpointId");
CREATE INDEX "WebhookDeliveryAttempt_outboxEventId_idx" ON "WebhookDeliveryAttempt"("outboxEventId");
CREATE INDEX "WebhookDeliveryAttempt_status_nextAttemptAt_idx" ON "WebhookDeliveryAttempt"("status", "nextAttemptAt");

ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_outboxEventId_fkey" FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
