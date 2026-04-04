import {
  TreasuryPayoutIntentStatus,
  PayoutMethodType,
} from "@prisma/client";
import { Connection, PublicKey } from "@solana/web3.js";
import { createTransferInstruction } from "@solana/spl-token";
import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { getCircleConfig } from "./circle-config";
import { ensureCircleCustomer, FiatDisabledError, FiatProviderError } from "./fiat-service";
import { getOrgTreasuryKeypair } from "@/lib/treasury/treasury-service";
import { env } from "@/lib/env";
import {
  assertValidPayoutTransition,
  isTerminalStatus,
} from "./payout-state-machine";
import { logTreasuryAudit } from "./treasury-audit";
import {
  getPayoutProvider,
  ProviderError,
  type ProviderPayoutStatus,
} from "./payout-providers";
import {
  recordLedgerEntriesForPayoutCreated,
  recordLedgerEntriesForFundingOnChain,
  recordLedgerEntriesForProviderSubmitted,
  recordLedgerEntriesForPayoutCompleted,
  recordLedgerEntriesForPayoutFailedOrCanceled,
} from "./treasury-ledger";
import {
  emitTreasuryEvent,
  payoutCreatedDedupKey,
  payoutStatusDedupKey,
  payoutFundedDedupKey,
  buildPayoutEventPayload,
} from "./treasury-events";

import {
  isRailSupported,
  UnsupportedRailError,
  UnsupportedCurrencyError,
  getProviderCapabilities,
} from "./payout-providers/capabilities";
import {
  validatePayoutRailInput,
  RailValidationError,
} from "./rails/rail-validation";
import {
  requireMintInRegistry,
  parseFundingDestination,
} from "./mints/mint-registry";
import {
  resolveFundingWalletForPayout,
  assertWalletSpendPolicy,
} from "./wallets/wallet-registry";
import {
  signAndSendSolanaTransfer,
  WarmKeyAccessError,
} from "./wallets/signing";
import {
  assertPayoutsAllowed,
  assertOnchainAllowed,
  assertProviderAllowed,
  assertRailAllowed,
} from "./safety-controls";
import { recordProviderSuccess, recordProviderFailure } from "./circuit-breakers";
import { treasuryLogger } from "./treasury-logger";

export class PayoutFundingUnsupportedError extends Error {
  code = "PAYOUT_FUNDING_UNSUPPORTED";
}

export { UnsupportedRailError, UnsupportedCurrencyError };
export { RailValidationError };

function validateRailForProvider(
  provider: string,
  rail: PayoutMethodType,
  currency: string
): void {
  const cap = getProviderCapabilities(provider);
  if (!cap.supportedCurrencies.includes(currency.toUpperCase())) {
    throw new UnsupportedCurrencyError(provider, currency);
  }
  if (!isRailSupported(provider, rail, currency)) {
    throw new UnsupportedRailError(
      provider,
      rail,
      currency
    );
  }
}

export async function ensureVendorBeneficiary(
  provider: string,
  vendorId: string,
  payoutDetails: {
    payoutMethodType: PayoutMethodType;
    currency?: string;
    accountNumber?: string;
    routingNumber?: string;
    billingName?: string;
    billingCity?: string;
    billingCountry?: string;
    billingLine1?: string;
    billingDistrict?: string;
    billingPostalCode?: string;
    bankName?: string;
    bankCity?: string;
    bankCountry?: string;
  }
) {
  const existing = await prisma.vendorFiatPayoutProfile.findUnique({
    where: { vendorId },
  });

  const providerRef = existing?.providerRecipientRef as
    | { providerRecipientId?: string }
    | null;
  if (existing?.circleBankAccountId || providerRef?.providerRecipientId) {
    return existing;
  }

  const providerImpl = getPayoutProvider(provider);

  let recipientRef;
  try {
    recipientRef = await providerImpl.createRecipient(payoutDetails);
  } catch (e) {
    if (e instanceof ProviderError) {
      throw new FiatProviderError(e.message, { cause: e });
    }
    throw e;
  }

  const maskedAccount = payoutDetails.accountNumber
    ? `****${payoutDetails.accountNumber.slice(-4)}`
    : "****";

  const isCircle = provider.toUpperCase() === "CIRCLE";

  const profile = await prisma.vendorFiatPayoutProfile.upsert({
    where: { vendorId },
    create: {
      vendorId,
      provider: provider.toUpperCase(),
      currency: payoutDetails.currency ?? "USD",
      circleBankAccountId: isCircle ? recipientRef.providerRecipientId : undefined,
      providerRecipientRef: {
        providerRecipientId: recipientRef.providerRecipientId,
        ...recipientRef.providerMeta,
      },
      payoutMethodType: payoutDetails.payoutMethodType,
      payoutDetailsJson: {
        maskedAccount,
        bankName: payoutDetails.bankName ?? null,
        billingName: payoutDetails.billingName ?? null,
        country: payoutDetails.billingCountry ?? "US",
      },
    },
    update: {
      circleBankAccountId: isCircle ? recipientRef.providerRecipientId : undefined,
      providerRecipientRef: {
        providerRecipientId: recipientRef.providerRecipientId,
        ...recipientRef.providerMeta,
      },
      payoutDetailsJson: {
        maskedAccount,
        bankName: payoutDetails.bankName ?? null,
        billingName: payoutDetails.billingName ?? null,
        country: payoutDetails.billingCountry ?? "US",
      },
    },
  });

  return profile;
}

/** @deprecated Use ensureVendorBeneficiary("CIRCLE", ...) instead */
export async function ensureVendorCircleBeneficiary(
  vendorId: string,
  payoutDetails: Parameters<typeof ensureVendorBeneficiary>[2]
) {
  return ensureVendorBeneficiary("CIRCLE", vendorId, payoutDetails);
}

export async function createPayoutIntent(params: {
  provider?: string;
  orgId: string;
  orgName: string;
  vendorId?: string;
  amountMinor: bigint;
  currency: string;
  createdByUserId: string;
  payoutRail?: PayoutMethodType;
  note?: string;
  idempotencyKey?: string;
}) {
  const provider = (params.provider ?? "CIRCLE").toUpperCase();
  const rail = params.payoutRail ?? PayoutMethodType.BANK_WIRE;

  await assertPayoutsAllowed(params.orgId);
  await assertProviderAllowed(provider, params.orgId);
  await assertRailAllowed(rail, params.orgId);

  treasuryLogger.info("treasury.payout.creating", {
    orgId: params.orgId,
    provider,
    rail,
    amountMinor: params.amountMinor.toString(),
    currency: params.currency,
    vendorId: params.vendorId ?? null,
  });

  if (provider === "CIRCLE") {
    const config = getCircleConfig();
    if (!config.enabled) throw new FiatDisabledError("Circle fiat not configured");
  }

  validateRailForProvider(provider, rail, params.currency);

  if (params.idempotencyKey) {
    const existing = await prisma.treasuryPayoutIntent.findFirst({
      where: {
        orgId: params.orgId,
        idempotencyKey: params.idempotencyKey,
      },
    });
    if (existing) return existing;
  }

  if (provider === "CIRCLE") {
    await ensureCircleCustomer(params.orgId, params.orgName);
  }

  let recipientId: string | undefined;
  if (params.vendorId) {
    const profile = await prisma.vendorFiatPayoutProfile.findUnique({
      where: { vendorId: params.vendorId },
    });
    const providerRef = profile?.providerRecipientRef as
      | { providerRecipientId?: string }
      | null;
    recipientId =
      providerRef?.providerRecipientId ?? profile?.circleBankAccountId ?? undefined;
    if (!recipientId) {
      throw new FiatProviderError(
        "Vendor payout profile not configured. Create a payout profile first."
      );
    }

    const profileDetails = profile?.payoutDetailsJson as Record<string, unknown> | null;
    validatePayoutRailInput({
      rail,
      currency: params.currency,
      profile: profileDetails,
      amountMinor: params.amountMinor,
    });
  }

  const providerImpl = getPayoutProvider(provider);
  const circleIdempotencyKey = params.idempotencyKey
    ? deriveProviderRequestId(params.idempotencyKey, provider)
    : generateRequestId();

  let providerResult;
  if (recipientId) {
    try {
      providerResult = await providerImpl.createPayout({
        idempotencyKey: circleIdempotencyKey,
        recipientId,
        amount: { amountMinor: params.amountMinor, currency: params.currency },
        payoutRail: rail,
      });
      recordProviderSuccess(provider);
    } catch (e) {
      await recordProviderFailure(provider, params.orgId);
      if (e instanceof ProviderError) {
        treasuryLogger.error("treasury.payout.provider_error", {
          orgId: params.orgId,
          provider,
          error: e.message,
        });
        throw new FiatProviderError(e.message, { cause: e });
      }
      throw e;
    }
  }

  const initialStatus = providerResult
    ? mapProviderStatusToIntent(providerResult.initialStatus)
    : TreasuryPayoutIntentStatus.CREATED;

  const isCircle = provider === "CIRCLE";

  const intent = await prisma.treasuryPayoutIntent.create({
    data: {
      orgId: params.orgId,
      provider,
      status: initialStatus,
      amountMinor: params.amountMinor,
      currency: params.currency,
      vendorId: params.vendorId ?? null,
      createdByUserId: params.createdByUserId,
      payoutRail: rail,
      circlePayoutId: isCircle ? (providerResult?.providerPayoutId ?? null) : null,
      circleTrackingRef: isCircle ? circleIdempotencyKey : null,
      providerPayoutId: providerResult?.providerPayoutId ?? null,
      providerRecipientId: recipientId ?? null,
      providerStatusRaw: null,
      note: params.note ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
    },
  });

  await logTreasuryAudit({
    orgId: params.orgId,
    actorId: params.createdByUserId,
    action: "PAYOUT_CREATED",
    entityType: "TreasuryPayoutIntent",
    entityId: intent.id,
    metadata: {
      amountMinor: params.amountMinor.toString(),
      currency: params.currency,
      vendorId: params.vendorId ?? null,
      provider,
      payoutRail: rail,
      providerPayoutId: providerResult?.providerPayoutId ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
    },
  });

  await recordLedgerEntriesForPayoutCreated({
    orgId: params.orgId,
    intentId: intent.id,
    amountMinor: params.amountMinor,
    currency: params.currency,
    provider,
    payoutRail: rail,
  });

  await emitTreasuryEvent({
    orgId: params.orgId,
    type: "PAYOUT_CREATED",
    entityType: "TreasuryPayoutIntent",
    entityId: intent.id,
    dedupKey: payoutCreatedDedupKey(intent.id),
    payload: buildPayoutEventPayload(intent),
  }).catch(() => {});

  treasuryLogger.info("treasury.payout.created", {
    intentId: intent.id,
    orgId: params.orgId,
    provider,
    rail,
    amountMinor: params.amountMinor.toString(),
    currency: params.currency,
  });

  return intent;
}

/** @deprecated Use createPayoutIntent() instead */
export async function createCirclePayoutIntent(params: {
  orgId: string;
  orgName: string;
  vendorId?: string;
  amountMinor: bigint;
  currency: string;
  createdByUserId: string;
  note?: string;
  idempotencyKey?: string;
}) {
  return createPayoutIntent({
    ...params,
    provider: "CIRCLE",
    payoutRail: PayoutMethodType.BANK_WIRE,
  });
}

function deriveProviderRequestId(key: string, provider: string): string {
  const { createHash } = require("crypto") as typeof import("crypto");
  const hash = createHash("sha256")
    .update(`${provider.toLowerCase()}-payout:${key}`)
    .digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) +
      hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

function generateRequestId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** @deprecated Use deriveProviderRequestId */
function deriveCircleRequestId(key: string): string {
  return deriveProviderRequestId(key, "circle");
}
export { deriveCircleRequestId as _deriveCircleRequestId };

function mapProviderStatusToIntent(
  status: ProviderPayoutStatus
): TreasuryPayoutIntentStatus {
  return status as TreasuryPayoutIntentStatus;
}

function resolveProviderPayoutId(intent: {
  providerPayoutId?: string | null;
  circlePayoutId?: string | null;
}): string | null {
  return intent.providerPayoutId ?? intent.circlePayoutId ?? null;
}

export async function fundOnChainIfRequired(
  orgId: string,
  payoutIntentId: string
) {
  await assertOnchainAllowed(orgId);

  const intent = await prisma.treasuryPayoutIntent.findFirst({
    where: { id: payoutIntentId, orgId },
  });
  if (!intent) throw new Error("Payout intent not found");

  const funding = intent.fundingDestinationJson as Record<string, unknown> | null;
  if (!funding) return intent;

  const address = funding.address as string | undefined;
  const amountRaw = funding.amount as string | undefined;
  const mintAddr = funding.mint as string | undefined;

  if (!address || !amountRaw) return intent;

  if (!mintAddr) {
    throw new PayoutFundingUnsupportedError(
      "Cannot determine token mint for on-chain payout funding. " +
        "fundingDestinationJson must include 'mint'."
    );
  }

  const parsed = parseFundingDestination(funding);

  if (parsed.chain !== "SOLANA") {
    throw new PayoutFundingUnsupportedError(
      `Unsupported chain for payout funding: ${parsed.chain}. Only Solana is supported.`
    );
  }

  await requireMintInRegistry(prisma as never, parsed.chain, parsed.mintAddress);

  let fundingWallet;
  try {
    fundingWallet = await resolveFundingWalletForPayout(prisma as never, orgId, {
      amountMinor: intent.amountMinor,
    });
  } catch {
    fundingWallet = null;
  }

  if (fundingWallet) {
    const spendCheck = await assertWalletSpendPolicy(
      prisma as never,
      orgId,
      intent.amountMinor,
      fundingWallet.type
    );

    if (spendCheck.requiresApproval) {
      if (intent.riskStatus !== "REQUIRES_APPROVAL") {
        await prisma.treasuryPayoutIntent.update({
          where: { id: intent.id },
          data: {
            riskStatus: "REQUIRES_APPROVAL",
            riskReasons: [spendCheck.reason ?? "ONCHAIN_SPEND_APPROVAL_REQUIRED"],
          },
        });

        await logTreasuryAudit({
          orgId,
          action: "ONCHAIN_TRANSFER_BLOCKED_BY_POLICY",
          entityType: "TreasuryPayoutIntent",
          entityId: intent.id,
          metadata: { reason: spendCheck.reason, walletType: fundingWallet.type },
        });
      }

      if (!intent.approvedAt) {
        return prisma.treasuryPayoutIntent.findUniqueOrThrow({
          where: { id: intent.id },
        });
      }
    }
  }

  let sig: string;
  if (fundingWallet) {
    sig = await signAndSendSolanaTransfer({
      fromWalletType: fundingWallet.type,
      mintAddress: parsed.mintAddress,
      destinationAddress: parsed.destinationAddress,
      amountRaw: BigInt(amountRaw),
      tokenProgramId: parsed.tokenProgram,
    });
  } else {
    const keypair = await getOrgTreasuryKeypair(orgId);
    if (!keypair) {
      throw new Error("Treasury keypair not found for org");
    }
    const rpcUrl = env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const mintPubkey = new PublicKey(parsed.mintAddress);
    const destinationPubkey = new PublicKey(parsed.destinationAddress);
    const programId = parsed.tokenProgram
      ? new PublicKey(parsed.tokenProgram)
      : undefined;
    const { getAssociatedTokenAddress } = await import("@solana/spl-token");
    const treasuryAta = await getAssociatedTokenAddress(
      mintPubkey,
      keypair.publicKey,
      false,
      programId
    );
    const amount = BigInt(amountRaw);
    const transferIx = createTransferInstruction(
      treasuryAta,
      destinationPubkey,
      keypair.publicKey,
      amount,
      [],
      programId
    );
    const tx = new Transaction().add(transferIx);
    sig = await sendAndConfirmTransaction(connection, tx, [keypair], {
      commitment: "confirmed",
      skipPreflight: false,
    });
  }

  treasuryLogger.info("treasury.onchain.transfer_sent", {
    intentId: intent.id,
    orgId,
    txSig: sig,
    amountRaw: amountRaw,
  });

  assertValidPayoutTransition(intent.status, TreasuryPayoutIntentStatus.SENT_ONCHAIN);

  const updated = await prisma.treasuryPayoutIntent.update({
    where: { id: intent.id },
    data: {
      status: TreasuryPayoutIntentStatus.SENT_ONCHAIN,
      onchainTxSig: sig,
    },
  });

  await logTreasuryAudit({
    orgId,
    action: "PAYOUT_FUNDED_ONCHAIN",
    entityType: "TreasuryPayoutIntent",
    entityId: intent.id,
    metadata: { txSig: sig, from: intent.status, to: "SENT_ONCHAIN" },
  });

  await recordLedgerEntriesForFundingOnChain({
    orgId,
    intentId: intent.id,
    amountMinor: intent.amountMinor,
    currency: intent.currency,
    provider: intent.provider,
    payoutRail: intent.payoutRail,
    txSig: sig,
  });

  await emitTreasuryEvent({
    orgId,
    type: "PAYOUT_FUNDED_ONCHAIN",
    entityType: "TreasuryPayoutIntent",
    entityId: intent.id,
    dedupKey: payoutFundedDedupKey(intent.id, sig),
    payload: buildPayoutEventPayload(
      { ...intent, status: "SENT_ONCHAIN" },
      { txSig: sig, fromStatus: intent.status, toStatus: "SENT_ONCHAIN" }
    ),
  }).catch(() => {});

  return updated;
}

/** @deprecated Use fundOnChainIfRequired */
export const fundCirclePayoutOnChainIfRequired = fundOnChainIfRequired;

export async function refreshPayoutStatus(orgId: string, payoutIntentId: string) {
  const intent = await prisma.treasuryPayoutIntent.findFirst({
    where: { id: payoutIntentId, orgId },
  });
  if (!intent) throw new Error("Payout intent not found");

  const ppid = resolveProviderPayoutId(intent);
  if (!ppid) return intent;
  if (isTerminalStatus(intent.status)) return intent;

  const providerImpl = getPayoutProvider(intent.provider);

  let result;
  try {
    result = await providerImpl.getPayout(ppid);
  } catch (e) {
    if (e instanceof ProviderError) {
      throw new FiatProviderError(e.message, { cause: e });
    }
    throw e;
  }

  const newStatus = mapProviderStatusToIntent(result.status);

  const updateData: Record<string, unknown> = {
    lastStatusRefreshAt: new Date(),
    providerStatusRaw: result.rawStatus,
  };

  if (newStatus && newStatus !== intent.status) {
    assertValidPayoutTransition(intent.status, newStatus);
    updateData.status = newStatus;
  }

  const updated = await prisma.treasuryPayoutIntent.update({
    where: { id: intent.id },
    data: updateData,
  });

  if (updateData.status) {
    const action =
      newStatus === "FAILED" ? "PAYOUT_FAILED" : "PAYOUT_STATUS_CHANGED";
    await logTreasuryAudit({
      orgId,
      action,
      entityType: "TreasuryPayoutIntent",
      entityId: intent.id,
      metadata: {
        from: intent.status,
        to: newStatus,
        provider: intent.provider,
        rawStatus: result.rawStatus,
        source: "refresh",
      },
    });

    await writeLedgerForTransition(intent, newStatus);

    const eventType =
      newStatus === "COMPLETED"
        ? "PAYOUT_COMPLETED"
        : newStatus === "FAILED"
          ? "PAYOUT_FAILED"
          : "PAYOUT_STATUS_CHANGED";
    await emitTreasuryEvent({
      orgId,
      type: eventType as import("@prisma/client").TreasuryEventType,
      entityType: "TreasuryPayoutIntent",
      entityId: intent.id,
      dedupKey: payoutStatusDedupKey(intent.id, newStatus),
      payload: buildPayoutEventPayload(
        { ...intent, status: newStatus },
        { fromStatus: intent.status, toStatus: newStatus, source: "refresh" }
      ),
    }).catch(() => {});
  }

  return updated;
}

async function writeLedgerForTransition(
  intent: {
    id: string;
    orgId: string;
    amountMinor: bigint;
    currency: string;
    provider: string;
    payoutRail: PayoutMethodType;
    providerPayoutId: string | null;
    circlePayoutId: string | null;
  },
  newStatus: TreasuryPayoutIntentStatus
): Promise<void> {
  const ppid = intent.providerPayoutId ?? intent.circlePayoutId;
  const ctx = {
    orgId: intent.orgId,
    intentId: intent.id,
    amountMinor: intent.amountMinor,
    currency: intent.currency,
    provider: intent.provider,
    payoutRail: intent.payoutRail,
    providerPayoutId: ppid,
  };

  if (newStatus === TreasuryPayoutIntentStatus.PROCESSING) {
    await recordLedgerEntriesForProviderSubmitted(ctx);
  } else if (newStatus === TreasuryPayoutIntentStatus.COMPLETED) {
    await recordLedgerEntriesForPayoutCompleted(ctx);
  } else if (
    newStatus === TreasuryPayoutIntentStatus.FAILED ||
    newStatus === TreasuryPayoutIntentStatus.CANCELED
  ) {
    await recordLedgerEntriesForPayoutFailedOrCanceled({
      ...ctx,
      failed: newStatus === TreasuryPayoutIntentStatus.FAILED,
    });
  }
}

export { writeLedgerForTransition as _writeLedgerForTransition };

const PAYOUT_STATUS_MAP: Record<string, TreasuryPayoutIntentStatus> = {
  pending: TreasuryPayoutIntentStatus.PENDING,
  queued: TreasuryPayoutIntentStatus.PENDING,
  processing: TreasuryPayoutIntentStatus.PROCESSING,
  complete: TreasuryPayoutIntentStatus.COMPLETED,
  completed: TreasuryPayoutIntentStatus.COMPLETED,
  paid: TreasuryPayoutIntentStatus.COMPLETED,
  failed: TreasuryPayoutIntentStatus.FAILED,
  rejected: TreasuryPayoutIntentStatus.FAILED,
  returned: TreasuryPayoutIntentStatus.FAILED,
  canceled: TreasuryPayoutIntentStatus.CANCELED,
  cancelled: TreasuryPayoutIntentStatus.CANCELED,
};

/** @deprecated Use provider.normalizeStatus() instead */
export function mapCirclePayoutStatus(
  rawStatus: string | undefined
): TreasuryPayoutIntentStatus | null {
  if (!rawStatus) return null;
  return PAYOUT_STATUS_MAP[rawStatus.toLowerCase()] ?? null;
}
