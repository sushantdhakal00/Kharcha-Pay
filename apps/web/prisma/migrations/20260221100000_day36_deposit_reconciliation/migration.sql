-- AlterEnum: add RECONCILED to TreasuryDepositIntentStatus
ALTER TYPE "TreasuryDepositIntentStatus" ADD VALUE 'RECONCILED';

-- AlterTable: add reconciliation metadata to TreasuryDepositIntent
ALTER TABLE "TreasuryDepositIntent" ADD COLUMN "reconciledAt" TIMESTAMP(3);
ALTER TABLE "TreasuryDepositIntent" ADD COLUMN "reconciledTxSig" TEXT;
ALTER TABLE "TreasuryDepositIntent" ADD COLUMN "reconciledTokenMint" TEXT;
ALTER TABLE "TreasuryDepositIntent" ADD COLUMN "reconciledTokenAccount" TEXT;
ALTER TABLE "TreasuryDepositIntent" ADD COLUMN "reconciliationNote" TEXT;
