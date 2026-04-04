-- AlterEnum
ALTER TYPE "OrgRole" ADD VALUE 'AUDITOR';

-- CreateTable
CREATE TABLE "OrgAuditRetention" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgAuditRetention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgAuditRetention_orgId_key" ON "OrgAuditRetention"("orgId");

-- CreateIndex
CREATE INDEX "OrgAuditRetention_orgId_idx" ON "OrgAuditRetention"("orgId");

-- AddForeignKey
ALTER TABLE "OrgAuditRetention" ADD CONSTRAINT "OrgAuditRetention_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
