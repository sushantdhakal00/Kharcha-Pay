-- Day 15: Payment reconciliation - ledger-grade verification
-- CreateEnum
CREATE TYPE "PaymentVerificationStatus" AS ENUM ('VERIFIED', 'WARNING', 'FAILED', 'PENDING');

-- CreateTable
CREATE TABLE "PaymentReconciliation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "txSig" TEXT NOT NULL,
    "status" "PaymentVerificationStatus" NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detailsJson" JSONB,
    "chainSlot" BIGINT,
    "blockTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReconciliation_requestId_key" ON "PaymentReconciliation"("requestId");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_orgId_checkedAt_idx" ON "PaymentReconciliation"("orgId", "checkedAt");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_orgId_status_idx" ON "PaymentReconciliation"("orgId", "status");

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ExpenseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
