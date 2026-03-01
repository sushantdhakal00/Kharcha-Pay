-- Day 22: Invoice attachments (presigned/upload), coding, policies, assignment
-- InvoiceAttachment: add orgId, uploadedByUserId, sha256 optional
ALTER TABLE "InvoiceAttachment" ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE "InvoiceAttachment" ADD COLUMN IF NOT EXISTS "uploadedByUserId" TEXT;
ALTER TABLE "InvoiceAttachment" ADD COLUMN IF NOT EXISTS "sha256" TEXT;
-- Backfill orgId from invoice
UPDATE "InvoiceAttachment" a SET "orgId" = i."orgId", "uploadedByUserId" = i."createdByUserId"
FROM "Invoice" i WHERE a."invoiceId" = i.id AND a."orgId" IS NULL;
-- Make orgId required for new rows (existing nulls allowed for backfill)
-- uploadedByUserId nullable

-- Invoice: assignedToUserId, assignedAt, attachmentCount
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "attachmentCount" INTEGER DEFAULT 0;

-- OrgGLCode for coding dictionary
CREATE TABLE IF NOT EXISTS "OrgGLCode" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgGLCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgGLCode_orgId_code_key" ON "OrgGLCode"("orgId", "code");
CREATE INDEX IF NOT EXISTS "OrgGLCode_orgId_idx" ON "OrgGLCode"("orgId");

-- OrgPolicy for match/control policies
CREATE TABLE IF NOT EXISTS "OrgPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL UNIQUE,
    "requirePoAboveAmountMinor" BIGINT DEFAULT 0,
    "requireAttachmentOnSubmit" BOOLEAN NOT NULL DEFAULT true,
    "allowApproverOverrideOnMismatch" BOOLEAN NOT NULL DEFAULT true,
    "highValueThresholdMinor" BIGINT DEFAULT 1000000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgPolicy_orgId_key" ON "OrgPolicy"("orgId");
