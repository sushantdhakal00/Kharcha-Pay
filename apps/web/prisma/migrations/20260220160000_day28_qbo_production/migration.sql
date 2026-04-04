-- Day 28: QuickBooks integration production-ready

-- AccountingConnection: add home currency, multi-currency, attachment links
ALTER TABLE "AccountingConnection" ADD COLUMN IF NOT EXISTS "homeCurrency" TEXT;
ALTER TABLE "AccountingConnection" ADD COLUMN IF NOT EXISTS "multiCurrencyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AccountingConnection" ADD COLUMN IF NOT EXISTS "includeAttachmentLinksInExport" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "AccountingConnection_realmId_idx" ON "AccountingConnection"("realmId");

-- AccountingSyncJobType: add RECONCILE_BILLS, QBO_CDC_SYNC
ALTER TYPE "AccountingSyncJobType" ADD VALUE 'RECONCILE_BILLS';
ALTER TYPE "AccountingSyncJobType" ADD VALUE 'QBO_CDC_SYNC';

-- QuickBooksWebhookEvent (enum + table)
CREATE TYPE "QuickBooksWebhookEventStatus" AS ENUM ('PENDING', 'PROCESSED');

CREATE TABLE "QuickBooksWebhookEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "realmId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" JSONB NOT NULL,
    "status" "QuickBooksWebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickBooksWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuickBooksWebhookEvent_realmId_idx" ON "QuickBooksWebhookEvent"("realmId");
CREATE INDEX "QuickBooksWebhookEvent_status_idx" ON "QuickBooksWebhookEvent"("status");
ALTER TABLE "QuickBooksWebhookEvent" ADD CONSTRAINT "QuickBooksWebhookEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AccountingRemoteChange
CREATE TYPE "AccountingRemoteChangeEntityType" AS ENUM ('BILL', 'VENDOR', 'ACCOUNT');
CREATE TYPE "AccountingRemoteChangeType" AS ENUM ('CREATED', 'UPDATED', 'DELETED');
CREATE TYPE "AccountingRemoteChangeStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "AccountingRemoteChange" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS_ONLINE',
    "entityType" "AccountingRemoteChangeEntityType" NOT NULL,
    "remoteId" TEXT NOT NULL,
    "localEntityType" TEXT,
    "localEntityId" TEXT,
    "changeType" "AccountingRemoteChangeType" NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AccountingRemoteChangeStatus" NOT NULL DEFAULT 'OPEN',
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingRemoteChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountingRemoteChange_orgId_idx" ON "AccountingRemoteChange"("orgId");
CREATE INDEX "AccountingRemoteChange_orgId_status_idx" ON "AccountingRemoteChange"("orgId", "status");
ALTER TABLE "AccountingRemoteChange" ADD CONSTRAINT "AccountingRemoteChange_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- OrgExternalVendor
CREATE TABLE "OrgExternalVendor" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS_ONLINE',
    "qboVendorId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "currency" TEXT,
    "lastUpdatedTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgExternalVendor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgExternalVendor_orgId_provider_qboVendorId_key" ON "OrgExternalVendor"("orgId", "provider", "qboVendorId");
CREATE INDEX "OrgExternalVendor_orgId_idx" ON "OrgExternalVendor"("orgId");
ALTER TABLE "OrgExternalVendor" ADD CONSTRAINT "OrgExternalVendor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- OrgExternalBill
CREATE TABLE "OrgExternalBill" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS_ONLINE',
    "qboBillId" TEXT NOT NULL,
    "docNumber" TEXT,
    "vendorId" TEXT,
    "total" TEXT,
    "currency" TEXT,
    "lastUpdatedTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgExternalBill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgExternalBill_orgId_provider_qboBillId_key" ON "OrgExternalBill"("orgId", "provider", "qboBillId");
CREATE INDEX "OrgExternalBill_orgId_idx" ON "OrgExternalBill"("orgId");
ALTER TABLE "OrgExternalBill" ADD CONSTRAINT "OrgExternalBill_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- OrgExternalBillPayment
CREATE TABLE "OrgExternalBillPayment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS_ONLINE',
    "qboBillPaymentId" TEXT NOT NULL,
    "linkedBillIds" TEXT,
    "total" TEXT,
    "currency" TEXT,
    "lastUpdatedTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgExternalBillPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgExternalBillPayment_orgId_provider_qboBillPaymentId_key" ON "OrgExternalBillPayment"("orgId", "provider", "qboBillPaymentId");
CREATE INDEX "OrgExternalBillPayment_orgId_idx" ON "OrgExternalBillPayment"("orgId");
ALTER TABLE "OrgExternalBillPayment" ADD CONSTRAINT "OrgExternalBillPayment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
