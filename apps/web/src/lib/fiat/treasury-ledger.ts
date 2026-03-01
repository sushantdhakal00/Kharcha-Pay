import {
  TreasuryLedgerEntryType,
  TreasuryLedgerAccount,
  LedgerDirection,
  PayoutMethodType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";

const { DEBIT, CREDIT } = LedgerDirection;
const { VENDOR_PAYABLE, CLEARING, PROVIDER_WALLET, TREASURY_WALLET, FEES_EXPENSE } =
  TreasuryLedgerAccount;

interface LedgerEntryInput {
  orgId: string;
  type: TreasuryLedgerEntryType;
  intentId?: string | null;
  provider?: string | null;
  payoutRail?: PayoutMethodType | null;
  currency?: string;
  amountMinor: bigint | number;
  direction: LedgerDirection;
  account: TreasuryLedgerAccount;
  externalRef?: string | null;
  metadata?: Record<string, unknown> | null;
}

async function writeLedgerEntry(
  entry: LedgerEntryInput,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx ?? prisma;
  try {
    await client.treasuryLedgerEntry.create({
      data: {
        orgId: entry.orgId,
        type: entry.type,
        intentId: entry.intentId ?? null,
        provider: entry.provider ?? null,
        payoutRail: entry.payoutRail ?? null,
        currency: entry.currency ?? "USD",
        amountMinor: BigInt(entry.amountMinor),
        direction: entry.direction,
        account: entry.account,
        externalRef: entry.externalRef ?? null,
        metadata: entry.metadata
          ? (entry.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  } catch (e: unknown) {
    const prismaError = e as { code?: string };
    if (prismaError.code === "P2002") {
      return;
    }
    throw e;
  }
}

async function writeLedgerPair(
  entries: [LedgerEntryInput, LedgerEntryInput],
  tx?: Prisma.TransactionClient
): Promise<void> {
  await writeLedgerEntry(entries[0], tx);
  await writeLedgerEntry(entries[1], tx);
}

interface PayoutContext {
  orgId: string;
  intentId: string;
  amountMinor: bigint | number;
  currency: string;
  provider?: string | null;
  payoutRail?: PayoutMethodType | null;
}

export async function recordLedgerEntriesForPayoutCreated(
  ctx: PayoutContext,
  tx?: Prisma.TransactionClient
): Promise<void> {
  await writeLedgerPair(
    [
      {
        orgId: ctx.orgId,
        type: TreasuryLedgerEntryType.PAYOUT_CREATED,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.amountMinor,
        direction: DEBIT,
        account: VENDOR_PAYABLE,
      },
      {
        orgId: ctx.orgId,
        type: TreasuryLedgerEntryType.PAYOUT_CREATED,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.amountMinor,
        direction: CREDIT,
        account: CLEARING,
      },
    ],
    tx
  );
}

export async function recordLedgerEntriesForFundingOnChain(
  ctx: PayoutContext & { txSig: string },
  tx?: Prisma.TransactionClient
): Promise<void> {
  await writeLedgerPair(
    [
      {
        orgId: ctx.orgId,
        type: TreasuryLedgerEntryType.PAYOUT_FUNDED_ONCHAIN,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.amountMinor,
        direction: DEBIT,
        account: PROVIDER_WALLET,
        externalRef: ctx.txSig,
      },
      {
        orgId: ctx.orgId,
        type: TreasuryLedgerEntryType.PAYOUT_FUNDED_ONCHAIN,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.amountMinor,
        direction: CREDIT,
        account: TREASURY_WALLET,
        externalRef: ctx.txSig,
      },
    ],
    tx
  );
}

export async function recordLedgerEntriesForProviderSubmitted(
  ctx: PayoutContext & { providerPayoutId?: string | null },
  tx?: Prisma.TransactionClient
): Promise<void> {
  await writeLedgerPair(
    [
      {
        orgId: ctx.orgId,
        type: TreasuryLedgerEntryType.PAYOUT_PROVIDER_SUBMITTED,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.amountMinor,
        direction: DEBIT,
        account: CLEARING,
        externalRef: ctx.providerPayoutId,
      },
      {
        orgId: ctx.orgId,
        type: TreasuryLedgerEntryType.PAYOUT_PROVIDER_SUBMITTED,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.amountMinor,
        direction: CREDIT,
        account: PROVIDER_WALLET,
        externalRef: ctx.providerPayoutId,
      },
    ],
    tx
  );
}

export async function recordLedgerEntriesForPayoutCompleted(
  ctx: PayoutContext & { providerPayoutId?: string | null },
  tx?: Prisma.TransactionClient
): Promise<void> {
  await writeLedgerPair(
    [
      {
        orgId: ctx.orgId,
        type: TreasuryLedgerEntryType.PAYOUT_COMPLETED,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.amountMinor,
        direction: DEBIT,
        account: CLEARING,
        externalRef: ctx.providerPayoutId,
      },
      {
        orgId: ctx.orgId,
        type: TreasuryLedgerEntryType.PAYOUT_COMPLETED,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.amountMinor,
        direction: CREDIT,
        account: VENDOR_PAYABLE,
        externalRef: ctx.providerPayoutId,
      },
    ],
    tx
  );
}

export async function recordLedgerEntriesForPayoutFailedOrCanceled(
  ctx: PayoutContext & {
    providerPayoutId?: string | null;
    failed: boolean;
  },
  tx?: Prisma.TransactionClient
): Promise<void> {
  const type = ctx.failed
    ? TreasuryLedgerEntryType.PAYOUT_FAILED
    : TreasuryLedgerEntryType.PAYOUT_CANCELED;

  await writeLedgerPair(
    [
      {
        orgId: ctx.orgId,
        type,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.amountMinor,
        direction: CREDIT,
        account: VENDOR_PAYABLE,
        externalRef: ctx.providerPayoutId,
      },
      {
        orgId: ctx.orgId,
        type,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.amountMinor,
        direction: DEBIT,
        account: CLEARING,
        externalRef: ctx.providerPayoutId,
      },
    ],
    tx
  );
}

export async function recordLedgerEntriesForFee(
  ctx: PayoutContext & {
    feeMinor: bigint | number;
    providerPayoutId?: string | null;
  },
  tx?: Prisma.TransactionClient
): Promise<void> {
  if (BigInt(ctx.feeMinor) <= BigInt(0)) return;

  await writeLedgerPair(
    [
      {
        orgId: ctx.orgId,
        type: TreasuryLedgerEntryType.FEE_ASSESSED,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.feeMinor,
        direction: DEBIT,
        account: FEES_EXPENSE,
        externalRef: ctx.providerPayoutId,
      },
      {
        orgId: ctx.orgId,
        type: TreasuryLedgerEntryType.FEE_ASSESSED,
        intentId: ctx.intentId,
        provider: ctx.provider,
        payoutRail: ctx.payoutRail,
        currency: ctx.currency,
        amountMinor: ctx.feeMinor,
        direction: CREDIT,
        account: CLEARING,
        externalRef: ctx.providerPayoutId,
      },
    ],
    tx
  );
}

// ---- Query helpers (pure functions) ----

export interface LedgerSummary {
  outstandingVendorPayable: number;
  inFlightClearing: number;
  fees30d: number;
}

export function computeLedgerSummary(
  entries: Array<{
    account: TreasuryLedgerAccount;
    direction: LedgerDirection;
    amountMinor: bigint | number;
    createdAt: Date;
  }>
): LedgerSummary {
  let vendorPayableNet = 0;
  let clearingNet = 0;
  let fees30d = 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  for (const e of entries) {
    const amt = Number(e.amountMinor);
    const signed = e.direction === DEBIT ? amt : -amt;

    if (e.account === VENDOR_PAYABLE) {
      vendorPayableNet += signed;
    } else if (e.account === CLEARING) {
      clearingNet += signed;
    }

    if (e.account === FEES_EXPENSE && e.createdAt >= thirtyDaysAgo) {
      fees30d += e.direction === DEBIT ? amt : 0;
    }
  }

  return {
    outstandingVendorPayable: vendorPayableNet,
    inFlightClearing: clearingNet,
    fees30d,
  };
}
