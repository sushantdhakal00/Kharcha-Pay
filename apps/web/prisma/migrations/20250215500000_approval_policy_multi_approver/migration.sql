-- AlterTable: add requiredApprovals to ExpenseRequest
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS "requiredApprovals" INTEGER NOT NULL DEFAULT 1;

-- CreateTable ApprovalPolicy
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable ApprovalTier
CREATE TABLE "ApprovalTier" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "minAmountMinor" BIGINT NOT NULL,
    "requiredApprovals" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalTier_pkey" PRIMARY KEY ("id")
);

-- Unique ApprovalPolicy per org
CREATE UNIQUE INDEX "ApprovalPolicy_orgId_key" ON "ApprovalPolicy"("orgId");
CREATE INDEX "ApprovalPolicy_orgId_idx" ON "ApprovalPolicy"("orgId");

-- ApprovalTier index
CREATE INDEX "ApprovalTier_policyId_idx" ON "ApprovalTier"("policyId");

-- AddForeignKey ApprovalPolicy -> Organization
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey ApprovalTier -> ApprovalPolicy
ALTER TABLE "ApprovalTier" ADD CONSTRAINT "ApprovalTier_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "ApprovalPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ApprovalAction: one decision per actor per request. If you have existing duplicate (requestId, actorUserId) rows, dedupe or delete before running.
CREATE UNIQUE INDEX "ApprovalAction_requestId_actorUserId_key" ON "ApprovalAction"("requestId", "actorUserId");
