-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_TERMS', 'ACTIVE');

-- CreateEnum
CREATE TYPE "OrgSetupPaymentIntentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN "termsAcceptedIp" TEXT,
ADD COLUMN "termsAcceptedUserAgent" TEXT;

-- CreateTable
CREATE TABLE "OrgSetupPaymentIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "OrgSetupPaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "requiredLamports" BIGINT NOT NULL,
    "paidLamports" BIGINT NOT NULL DEFAULT 0,
    "treasuryPubkey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "overpaidLamports" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSetupPaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSetupPaymentTx" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "lamports" BIGINT NOT NULL,
    "slot" BIGINT,
    "blockTime" TIMESTAMP(3),
    "commitment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgSetupPaymentTx_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cached_exchange_rate" (
    "id" TEXT NOT NULL,
    "value" DECIMAL(20,8) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cached_exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgSetupPaymentIntent_organizationId_key" ON "OrgSetupPaymentIntent"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSetupPaymentIntent_reference_key" ON "OrgSetupPaymentIntent"("reference");

-- CreateIndex
CREATE INDEX "OrgSetupPaymentIntent_userId_idx" ON "OrgSetupPaymentIntent"("userId");

-- CreateIndex
CREATE INDEX "OrgSetupPaymentIntent_reference_idx" ON "OrgSetupPaymentIntent"("reference");

-- CreateIndex
CREATE INDEX "OrgSetupPaymentIntent_status_idx" ON "OrgSetupPaymentIntent"("status");

-- CreateIndex
CREATE INDEX "OrgSetupPaymentIntent_organizationId_idx" ON "OrgSetupPaymentIntent"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSetupPaymentTx_signature_key" ON "OrgSetupPaymentTx"("signature");

-- CreateIndex
CREATE INDEX "OrgSetupPaymentTx_intentId_idx" ON "OrgSetupPaymentTx"("intentId");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- AddForeignKey
ALTER TABLE "OrgSetupPaymentIntent" ADD CONSTRAINT "OrgSetupPaymentIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSetupPaymentIntent" ADD CONSTRAINT "OrgSetupPaymentIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSetupPaymentTx" ADD CONSTRAINT "OrgSetupPaymentTx_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "OrgSetupPaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
