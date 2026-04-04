-- CreateEnum
CREATE TYPE "TreasuryChain" AS ENUM ('SOLANA');

-- CreateTable
CREATE TABLE "OrgTreasuryWallet" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "chain" "TreasuryChain" NOT NULL DEFAULT 'SOLANA',
    "cluster" TEXT NOT NULL,
    "treasuryPubkey" TEXT NOT NULL,
    "treasuryKeypairEncrypted" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgTreasuryWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgTreasuryWallet_orgId_key" ON "OrgTreasuryWallet"("orgId");

-- CreateIndex
CREATE INDEX "OrgTreasuryWallet_orgId_idx" ON "OrgTreasuryWallet"("orgId");

-- AddForeignKey
ALTER TABLE "OrgTreasuryWallet" ADD CONSTRAINT "OrgTreasuryWallet_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
