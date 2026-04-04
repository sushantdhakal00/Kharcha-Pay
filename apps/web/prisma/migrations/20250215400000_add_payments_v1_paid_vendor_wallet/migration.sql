-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'PAID';

-- AlterTable
ALTER TABLE "ExpenseRequest" ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "paidTxSig" TEXT,
ADD COLUMN "paidByUserId" TEXT,
ADD COLUMN "paidToTokenAccount" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN "ownerPubkey" TEXT,
ADD COLUMN "tokenAccount" TEXT;
