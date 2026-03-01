-- Day 40: Multi-Provider + Multi-Rail Payouts

-- TreasuryPayoutIntent: change provider from enum to text, add provider-agnostic fields
ALTER TABLE "TreasuryPayoutIntent" ALTER COLUMN "provider" SET DATA TYPE TEXT;
ALTER TABLE "TreasuryPayoutIntent" ALTER COLUMN "provider" SET DEFAULT 'CIRCLE';

ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "providerPayoutId" TEXT;
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "providerRecipientId" TEXT;
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "providerStatusRaw" TEXT;
ALTER TABLE "TreasuryPayoutIntent" ADD COLUMN "payoutRail" "PayoutMethodType" NOT NULL DEFAULT 'BANK_WIRE';

-- Backfill providerPayoutId from circlePayoutId for existing rows
UPDATE "TreasuryPayoutIntent" SET "providerPayoutId" = "circlePayoutId" WHERE "circlePayoutId" IS NOT NULL AND "providerPayoutId" IS NULL;

-- Index for provider-agnostic lookup
CREATE INDEX "TreasuryPayoutIntent_orgId_provider_providerPayoutId_idx" ON "TreasuryPayoutIntent"("orgId", "provider", "providerPayoutId");

-- VendorFiatPayoutProfile: change provider from enum to text, add providerRecipientRef
ALTER TABLE "VendorFiatPayoutProfile" ALTER COLUMN "provider" SET DATA TYPE TEXT;
ALTER TABLE "VendorFiatPayoutProfile" ALTER COLUMN "provider" SET DEFAULT 'CIRCLE';

ALTER TABLE "VendorFiatPayoutProfile" ADD COLUMN "providerRecipientRef" JSONB;

-- Backfill providerRecipientRef from circleBankAccountId for existing rows
UPDATE "VendorFiatPayoutProfile"
SET "providerRecipientRef" = jsonb_build_object('providerRecipientId', "circleBankAccountId")
WHERE "circleBankAccountId" IS NOT NULL AND "providerRecipientRef" IS NULL;
