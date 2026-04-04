-- Day 27: QuickBooks Online integration - AccountingConnection, AccountingMapping, AccountingSyncJob, AccountingSyncCursor, AccountingSyncLog, ExternalIdLink, Payment

-- CreateEnum
CREATE TYPE "AccountingProvider" AS ENUM ('QUICKBOOKS_ONLINE');
CREATE TYPE "AccountingConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');
CREATE TYPE "AccountingMappingLocalType" AS ENUM ('GL_CODE', 'DEPARTMENT', 'COST_CENTER', 'PROJECT');
CREATE TYPE "AccountingMappingRemoteType" AS ENUM ('QBO_ACCOUNT', 'QBO_CLASS', 'QBO_LOCATION', 'QBO_VENDOR');
CREATE TYPE "AccountingSyncJobType" AS ENUM ('IMPORT_REFERENCE', 'EXPORT_BILLS', 'EXPORT_PAYMENTS', 'FULL_SYNC');
CREATE TYPE "AccountingSyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');
CREATE TYPE "AccountingSyncCursorEntity" AS ENUM ('ACCOUNTS', 'VENDORS', 'BILLS', 'PAYMENTS');
CREATE TYPE "AccountingSyncLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');
CREATE TYPE "ExternalIdLinkLocalEntity" AS ENUM ('VENDOR', 'INVOICE', 'PAYMENT');
CREATE TYPE "ExternalIdLinkRemoteEntity" AS ENUM ('QBO_VENDOR', 'QBO_BILL', 'QBO_BILLPAYMENT');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- OrgExternalGLAccount (cache of QBO accounts for mapping dropdown)
CREATE TABLE "OrgExternalGLAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS_ONLINE',
    "remoteId" TEXT NOT NULL,
    "remoteName" TEXT NOT NULL,
    "accountType" TEXT,
    "syncJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgExternalGLAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgExternalGLAccount_orgId_provider_remoteId_key" ON "OrgExternalGLAccount"("orgId", "provider", "remoteId");
CREATE INDEX "OrgExternalGLAccount_orgId_idx" ON "OrgExternalGLAccount"("orgId");

-- AccountingConnection
CREATE TABLE "AccountingConnection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS_ONLINE',
    "status" "AccountingConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "realmId" TEXT,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "connectedByUserId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingConnection_orgId_provider_key" ON "AccountingConnection"("orgId", "provider");
CREATE INDEX "AccountingConnection_orgId_idx" ON "AccountingConnection"("orgId");

-- AccountingMapping
CREATE TABLE "AccountingMapping" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS_ONLINE',
    "localType" "AccountingMappingLocalType" NOT NULL,
    "localId" TEXT NOT NULL,
    "remoteType" "AccountingMappingRemoteType" NOT NULL,
    "remoteId" TEXT NOT NULL,
    "remoteName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingMapping_orgId_provider_localType_localId_key" ON "AccountingMapping"("orgId", "provider", "localType", "localId");
CREATE INDEX "AccountingMapping_orgId_idx" ON "AccountingMapping"("orgId");

-- AccountingSyncJob
CREATE TABLE "AccountingSyncJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS_ONLINE',
    "type" "AccountingSyncJobType" NOT NULL,
    "status" "AccountingSyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingSyncJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountingSyncJob_orgId_idx" ON "AccountingSyncJob"("orgId");
CREATE INDEX "AccountingSyncJob_orgId_status_idx" ON "AccountingSyncJob"("orgId", "status");

-- AccountingSyncCursor
CREATE TABLE "AccountingSyncCursor" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS_ONLINE',
    "entity" "AccountingSyncCursorEntity" NOT NULL,
    "cursor" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingSyncCursor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingSyncCursor_orgId_provider_entity_key" ON "AccountingSyncCursor"("orgId", "provider", "entity");
CREATE INDEX "AccountingSyncCursor_orgId_idx" ON "AccountingSyncCursor"("orgId");

-- AccountingSyncLog
CREATE TABLE "AccountingSyncLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS_ONLINE',
    "jobId" TEXT,
    "level" "AccountingSyncLogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingSyncLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountingSyncLog_orgId_idx" ON "AccountingSyncLog"("orgId");
CREATE INDEX "AccountingSyncLog_jobId_idx" ON "AccountingSyncLog"("jobId");
CREATE INDEX "AccountingSyncLog_createdAt_idx" ON "AccountingSyncLog"("createdAt");

-- ExternalIdLink
CREATE TABLE "ExternalIdLink" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL DEFAULT 'QUICKBOOKS_ONLINE',
    "localEntityType" "ExternalIdLinkLocalEntity" NOT NULL,
    "localEntityId" TEXT NOT NULL,
    "remoteEntityType" "ExternalIdLinkRemoteEntity" NOT NULL,
    "remoteEntityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalIdLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExternalIdLink_orgId_provider_localEntityType_localEntityId_key" ON "ExternalIdLink"("orgId", "provider", "localEntityType", "localEntityId");
CREATE INDEX "ExternalIdLink_orgId_idx" ON "ExternalIdLink"("orgId");

-- Payment
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payment_orgId_idx" ON "Payment"("orgId");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- Add foreign keys
ALTER TABLE "OrgExternalGLAccount" ADD CONSTRAINT "OrgExternalGLAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingConnection" ADD CONSTRAINT "AccountingConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingMapping" ADD CONSTRAINT "AccountingMapping_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingSyncJob" ADD CONSTRAINT "AccountingSyncJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingSyncCursor" ADD CONSTRAINT "AccountingSyncCursor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingSyncLog" ADD CONSTRAINT "AccountingSyncLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingSyncLog" ADD CONSTRAINT "AccountingSyncLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AccountingSyncJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExternalIdLink" ADD CONSTRAINT "ExternalIdLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
