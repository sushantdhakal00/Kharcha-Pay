-- CreateTable
CREATE TABLE "CircleWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "FiatProvider" NOT NULL DEFAULT 'CIRCLE',
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "circleObjectId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CircleWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CircleWebhookEvent_eventId_key" ON "CircleWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "CircleWebhookEvent_circleObjectId_idx" ON "CircleWebhookEvent"("circleObjectId");

-- CreateIndex
CREATE INDEX "CircleWebhookEvent_eventType_idx" ON "CircleWebhookEvent"("eventType");

-- CreateIndex (add lookup index on TreasuryDepositIntent.circleIntentId)
CREATE INDEX "TreasuryDepositIntent_circleIntentId_idx" ON "TreasuryDepositIntent"("circleIntentId");
