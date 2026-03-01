-- Day 43: Treasury Policy Engine + Risk Controls

-- CreateEnum
CREATE TYPE "TreasuryApprovalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TreasuryRiskStatus" AS ENUM ('CLEAR', 'REQUIRES_APPROVAL', 'BLOCKED');

-- AlterEnum (add new event types)
ALTER TYPE "TreasuryEventType" ADD VALUE 'PAYOUT_APPROVAL_REQUESTED';
ALTER TYPE "TreasuryEventType" ADD VALUE 'PAYOUT_APPROVED';
ALTER TYPE "TreasuryEventType" ADD VALUE 'PAYOUT_REJECTED';
ALTER TYPE "TreasuryEventType" ADD VALUE 'POLICY_BLOCKED_PAYOUT';

-- CreateTable: TreasuryPolicy (per-org versioned policy)
CREATE TABLE "TreasuryPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TreasuryPayoutApproval
CREATE TABLE "TreasuryPayoutApproval" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "status" "TreasuryApprovalStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "rejectedByUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "TreasuryPayoutApproval_pkey" PRIMARY KEY ("id")
);

-- Extend TreasuryPayoutIntent with risk fields
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "riskStatus" "TreasuryRiskStatus" NOT NULL DEFAULT 'CLEAR';
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "riskReasons" JSONB;
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "approvalId" TEXT;
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "requestedAt" TIMESTAMP(3);
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "approvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TreasuryPolicy_orgId_isActive_idx" ON "TreasuryPolicy"("orgId", "isActive");
CREATE UNIQUE INDEX "TreasuryPolicy_orgId_version_key" ON "TreasuryPolicy"("orgId", "version");

CREATE UNIQUE INDEX "TreasuryPayoutApproval_intentId_key" ON "TreasuryPayoutApproval"("intentId");
CREATE INDEX "TreasuryPayoutApproval_orgId_status_createdAt_idx" ON "TreasuryPayoutApproval"("orgId", "status", "createdAt");

CREATE INDEX "TreasuryPayoutIntent_orgId_riskStatus_createdAt_idx" ON "TreasuryPayoutIntent"("orgId", "riskStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "TreasuryPolicy" ADD CONSTRAINT "TreasuryPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreasuryPayoutApproval" ADD CONSTRAINT "TreasuryPayoutApproval_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TreasuryPayoutApproval" ADD CONSTRAINT "TreasuryPayoutApproval_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "TreasuryPayoutIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
