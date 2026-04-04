-- CreateTable OrgSpendPolicy (1 per org)
CREATE TABLE "OrgSpendPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requireReceiptForPayment" BOOLEAN NOT NULL DEFAULT true,
    "receiptRequiredAboveMinor" BIGINT NOT NULL DEFAULT 0,
    "blockOverBudget" BOOLEAN NOT NULL DEFAULT true,
    "allowAdminOverrideOverBudget" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSpendPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgSpendPolicy_orgId_key" ON "OrgSpendPolicy"("orgId");
CREATE INDEX "OrgSpendPolicy_orgId_idx" ON "OrgSpendPolicy"("orgId");

ALTER TABLE "OrgSpendPolicy" ADD CONSTRAINT "OrgSpendPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
