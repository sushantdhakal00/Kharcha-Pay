-- Day 23: Vendor 360, Onboarding, Bank Change Control
-- CreateEnum
CREATE TYPE "VendorRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
ALTER TYPE "VendorStatus" ADD VALUE 'ONBOARDING';
ALTER TYPE "VendorStatus" ADD VALUE 'BLOCKED';
ALTER TYPE "VendorStatus" ADD VALUE 'INACTIVE';

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN "displayName" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "taxId" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "registrationId" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "category" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "riskLevel" "VendorRiskLevel" NOT NULL DEFAULT 'LOW';

-- CreateEnum
CREATE TYPE "VendorDocumentType" AS ENUM ('W9', 'W8BEN', 'VAT', 'CONTRACT', 'INSURANCE', 'OTHER');
CREATE TYPE "VendorDocumentStatus" AS ENUM ('RECEIVED', 'VERIFIED', 'REJECTED');
CREATE TYPE "VendorPaymentMethodType" AS ENUM ('BANK_TRANSFER', 'WALLET_ADDRESS', 'CHECK');
CREATE TYPE "VendorPaymentMethodStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'DISABLED');
CREATE TYPE "VendorBankChangeRequestStatus" AS ENUM ('SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'CANCELED');
CREATE TYPE "VendorOnboardingCaseStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'WAITING_VENDOR', 'APPROVED', 'BLOCKED', 'CLOSED');
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "VendorContact" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "roleTitle" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDocument" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "type" "VendorDocumentType" NOT NULL,
    "storageKey" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "status" "VendorDocumentStatus" NOT NULL DEFAULT 'RECEIVED',
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPaymentMethod" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "type" "VendorPaymentMethodType" NOT NULL DEFAULT 'BANK_TRANSFER',
    "bankAccountMasked" TEXT,
    "bankName" TEXT,
    "country" TEXT,
    "currency" TEXT,
    "status" "VendorPaymentMethodStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBankChangeRequest" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "newPaymentMethodDraft" JSONB,
    "reason" TEXT,
    "status" "VendorBankChangeRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "secondApprovedByUserId" TEXT,
    "secondApprovedAt" TIMESTAMP(3),

    CONSTRAINT "VendorBankChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorOnboardingCase" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "createdByUserId" TEXT,
    "status" "VendorOnboardingCaseStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "riskLevelSnapshot" TEXT,
    "checklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorOnboardingCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgVendorPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requireDualApprovalForBankChanges" BOOLEAN NOT NULL DEFAULT true,
    "requireVendorDocsBeforeActivation" BOOLEAN NOT NULL DEFAULT true,
    "allowApproverToActivateVendor" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgVendorPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_orgId_riskLevel_idx" ON "Vendor"("orgId", "riskLevel");

-- CreateIndex
CREATE INDEX "VendorContact_vendorId_idx" ON "VendorContact"("vendorId");

-- CreateIndex
CREATE INDEX "VendorDocument_vendorId_idx" ON "VendorDocument"("vendorId");
CREATE INDEX "VendorDocument_vendorId_type_idx" ON "VendorDocument"("vendorId", "type");

-- CreateIndex
CREATE INDEX "VendorPaymentMethod_vendorId_idx" ON "VendorPaymentMethod"("vendorId");

-- CreateIndex
CREATE INDEX "VendorBankChangeRequest_vendorId_idx" ON "VendorBankChangeRequest"("vendorId");
CREATE INDEX "VendorBankChangeRequest_vendorId_status_idx" ON "VendorBankChangeRequest"("vendorId", "status");

-- CreateIndex
CREATE INDEX "VendorOnboardingCase_orgId_idx" ON "VendorOnboardingCase"("orgId");
CREATE INDEX "VendorOnboardingCase_vendorId_idx" ON "VendorOnboardingCase"("vendorId");
CREATE INDEX "VendorOnboardingCase_orgId_status_idx" ON "VendorOnboardingCase"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrgVendorPolicy_orgId_key" ON "OrgVendorPolicy"("orgId");
CREATE INDEX "OrgVendorPolicy_orgId_idx" ON "OrgVendorPolicy"("orgId");

-- CreateIndex
CREATE INDEX "OutboxEvent_orgId_idx" ON "OutboxEvent"("orgId");
CREATE INDEX "OutboxEvent_orgId_status_idx" ON "OutboxEvent"("orgId", "status");
CREATE INDEX "OutboxEvent_occurredAt_idx" ON "OutboxEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentMethod" ADD CONSTRAINT "VendorPaymentMethod_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBankChangeRequest" ADD CONSTRAINT "VendorBankChangeRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOnboardingCase" ADD CONSTRAINT "VendorOnboardingCase_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOnboardingCase" ADD CONSTRAINT "VendorOnboardingCase_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgVendorPolicy" ADD CONSTRAINT "OrgVendorPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
