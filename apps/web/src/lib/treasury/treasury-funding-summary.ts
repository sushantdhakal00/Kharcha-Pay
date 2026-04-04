import { prisma } from "@/lib/db";
import { TreasuryDepositIntentStatus, RequestStatus } from "@prisma/client";
import {
  getOrgTreasuryBalances,
  TreasuryBalanceToken,
} from "./treasury-balance-service";

export interface TreasuryFundingSummary {
  orgId: string;
  currency: string;
  incomingAmountMinor: string;
  incomingAmount: string;
  available: {
    sol: string;
    tokens: Array<{ mint: string; program: "token" | "token2022"; amount: string }>;
  };
  reservedAmountMinor?: string;
  reservedAmount?: string;
  fetchedAt: string;
}

export function sumDepositIntentsMinor(
  intents: Array<{ amountMinor: bigint }>
): bigint {
  let total = BigInt(0);
  for (const i of intents) {
    total += i.amountMinor;
  }
  return total;
}

export function formatMinorToMajor(minor: bigint, decimals = 2): string {
  const divisor = BigInt(10 ** decimals);
  const intPart = minor / divisor;
  const fracPart = minor % divisor;
  if (fracPart === BigInt(0)) return `${intPart}.00`;
  const fracStr = fracPart.toString().padStart(decimals, "0");
  return `${intPart}.${fracStr}`;
}

export async function getOrgTreasuryFundingSummary(
  orgId: string
): Promise<TreasuryFundingSummary> {
  const [balances, pendingIntents, reservedAgg] = await Promise.all([
    getOrgTreasuryBalances(orgId).catch(() => null),
    prisma.treasuryDepositIntent.findMany({
      where: {
        orgId,
        status: {
          in: [
            TreasuryDepositIntentStatus.CREATED,
            TreasuryDepositIntentStatus.PENDING,
          ],
        },
      },
      select: { amountMinor: true },
    }),
    prisma.expenseRequest.aggregate({
      where: {
        orgId,
        status: RequestStatus.APPROVED,
      },
      _sum: { amountMinor: true },
    }),
  ]);

  const incomingMinor = sumDepositIntentsMinor(pendingIntents);

  const tokens: TreasuryFundingSummary["available"]["tokens"] = balances
    ? balances.tokens.map((t: TreasuryBalanceToken) => ({
        mint: t.mint,
        program: t.program,
        amount: t.amount,
      }))
    : [];

  const reservedRaw = reservedAgg._sum.amountMinor;
  const hasReserved = reservedRaw !== null && reservedRaw > BigInt(0);

  return {
    orgId,
    currency: "USD",
    incomingAmountMinor: incomingMinor.toString(),
    incomingAmount: formatMinorToMajor(incomingMinor),
    available: {
      sol: balances?.sol ?? "0",
      tokens,
    },
    reservedAmountMinor: hasReserved ? reservedRaw!.toString() : undefined,
    reservedAmount: hasReserved ? formatMinorToMajor(reservedRaw!) : undefined,
    fetchedAt: new Date().toISOString(),
  };
}
