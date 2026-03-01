-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "demoOwnerUserId" TEXT,
ADD COLUMN "demoSeedVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Organization_isDemo_demoOwnerUserId_idx" ON "Organization"("isDemo", "demoOwnerUserId");
