-- CreateEnum
CREATE TYPE "TreasuryPayoutIntentStatus" AS ENUM ('CREATED', 'PENDING', 'SENT_ONCHAIN', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PayoutMethodType" AS ENUM ('BANK_WIRE', 'ACH', 'LOCAL');

-- CreateTable
CREATE TABLE "TreasuryPayoutIntent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "FiatProvider" NOT NULL DEFAULT 'CIRCLE',
    "status" "TreasuryPayoutIntentStatus" NOT NULL DEFAULT 'CREATED',
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "vendorId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "circlePayoutId" TEXT,
    "circleTrackingRef" TEXT,
    "fundingDestinationJson" JSONB,
    "onchainTxSig" TEXT,
    "note" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryPayoutIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorFiatPayoutProfile" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "provider" "FiatProvider" NOT NULL DEFAULT 'CIRCLE',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "circleBeneficiaryId" TEXT,
    "circleBankAccountId" TEXT,
    "payoutMethodType" "PayoutMethodType" NOT NULL DEFAULT 'BANK_WIRE',
    "payoutDetailsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorFiatPayoutProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreasuryPayoutIntent_orgId_status_idx" ON "TreasuryPayoutIntent"("orgId", "status");

-- CreateIndex
CREATE INDEX "TreasuryPayoutIntent_circlePayoutId_idx" ON "TreasuryPayoutIntent"("circlePayoutId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorFiatPayoutProfile_vendorId_key" ON "VendorFiatPayoutProfile"("vendorId");

-- CreateIndex
CREATE INDEX "VendorFiatPayoutProfile_vendorId_idx" ON "VendorFiatPayoutProfile"("vendorId");

-- AddForeignKey
ALTER TABLE "TreasuryPayoutIntent" ADD CONSTRAINT "TreasuryPayoutIntent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
