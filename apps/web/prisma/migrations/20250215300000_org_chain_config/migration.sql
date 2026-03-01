-- CreateTable
CREATE TABLE "OrgChainConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "cluster" TEXT NOT NULL,
    "rpcUrl" TEXT,
    "token2022Mint" TEXT,
    "tokenProgramId" TEXT NOT NULL DEFAULT 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    "treasuryOwnerPubkey" TEXT NOT NULL,
    "treasuryTokenAccount" TEXT,
    "vendorOwnerPubkey" TEXT,
    "vendorTokenAccount" TEXT,
    "auditorElgamalPubkey" TEXT,
    "lastInitMintTx" TEXT,
    "lastInitAccountsTx" TEXT,
    "lastMintToTx" TEXT,
    "lastDepositTx" TEXT,
    "lastApplyPendingTx" TEXT,
    "lastCtTransferTx" TEXT,
    "lastWithdrawTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgChainConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgChainConfig_orgId_key" ON "OrgChainConfig"("orgId");

-- CreateIndex
CREATE INDEX "OrgChainConfig_orgId_idx" ON "OrgChainConfig"("orgId");

-- AddForeignKey
ALTER TABLE "OrgChainConfig" ADD CONSTRAINT "OrgChainConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
