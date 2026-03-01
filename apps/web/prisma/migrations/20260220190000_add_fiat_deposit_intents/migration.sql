-- CreateEnum
CREATE TYPE "FiatProvider" AS ENUM ('CIRCLE');

-- CreateEnum
CREATE TYPE "TreasuryDepositIntentStatus" AS ENUM ('CREATED', 'PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "OrgFiatProvider" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "FiatProvider" NOT NULL DEFAULT 'CIRCLE',
    "circleCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgFiatProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryDepositIntent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "FiatProvider" NOT NULL DEFAULT 'CIRCLE',
    "status" "TreasuryDepositIntentStatus" NOT NULL DEFAULT 'CREATED',
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "circleIntentId" TEXT NOT NULL,
    "fundingInstructionsJson" JSONB NOT NULL,
    "hostedUrl" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryDepositIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgFiatProvider_orgId_key" ON "OrgFiatProvider"("orgId");

-- CreateIndex
CREATE INDEX "OrgFiatProvider_orgId_idx" ON "OrgFiatProvider"("orgId");

-- CreateIndex
CREATE INDEX "TreasuryDepositIntent_orgId_idx" ON "TreasuryDepositIntent"("orgId");

-- CreateIndex
CREATE INDEX "TreasuryDepositIntent_createdByUserId_idx" ON "TreasuryDepositIntent"("createdByUserId");

-- AddForeignKey
ALTER TABLE "OrgFiatProvider" ADD CONSTRAINT "OrgFiatProvider_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryDepositIntent" ADD CONSTRAINT "TreasuryDepositIntent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryDepositIntent" ADD CONSTRAINT "TreasuryDepositIntent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
