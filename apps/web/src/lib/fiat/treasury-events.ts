import { TreasuryEventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface EmitTreasuryEventParams {
  orgId: string;
  type: TreasuryEventType;
  entityType: string;
  entityId: string;
  dedupKey: string;
  payload: Record<string, unknown>;
}

export async function emitTreasuryEvent(
  params: EmitTreasuryEventParams
): Promise<boolean> {
  try {
    await prisma.treasuryEvent.create({
      data: {
        orgId: params.orgId,
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId,
        dedupKey: params.dedupKey,
        payload: params.payload as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch (e: unknown) {
    const prismaError = e as { code?: string };
    if (prismaError.code === "P2002") {
      return false;
    }
    throw e;
  }
}

export function payoutCreatedDedupKey(intentId: string): string {
  return `payout:${intentId}:created`;
}

export function payoutStatusDedupKey(
  intentId: string,
  newStatus: string
): string {
  return `payout:${intentId}:status:${newStatus}`;
}

export function payoutFundedDedupKey(
  intentId: string,
  txSig: string
): string {
  return `payout:${intentId}:funded:${txSig.slice(0, 16)}`;
}

export function alertDedupKey(
  orgId: string,
  kind: string,
  windowMinutes: number = 60
): string {
  const windowStart = new Date(
    Math.floor(Date.now() / (windowMinutes * 60 * 1000)) * (windowMinutes * 60 * 1000)
  ).toISOString();
  return `alert:${orgId}:${kind}:${windowStart}`;
}

export function ledgerEntryDedupKey(entryId: string): string {
  return `ledger:${entryId}`;
}

export function approvalRequestedDedupKey(intentId: string): string {
  return `payout:${intentId}:approval_requested`;
}

export function approvalDecidedDedupKey(intentId: string, decision: string): string {
  return `payout:${intentId}:approval:${decision}`;
}

export function policyBlockedDedupKey(intentId: string): string {
  return `payout:${intentId}:policy_blocked`;
}

export function walletDedupKey(walletId: string, action: string): string {
  return `wallet:${walletId}:${action}`;
}

export function mintDedupKey(mintId: string, action: string): string {
  return `mint:${mintId}:${action}`;
}

export function spendPolicyDedupKey(orgId: string): string {
  const ts = new Date().toISOString().slice(0, 19);
  return `spend-policy:${orgId}:updated:${ts}`;
}

export function onchainTransferBlockedDedupKey(intentId: string): string {
  return `payout:${intentId}:onchain_blocked`;
}

export function buildPayoutEventPayload(intent: {
  id: string;
  orgId: string;
  vendorId?: string | null;
  amountMinor: bigint | number;
  currency: string;
  status: string;
  provider: string;
  providerPayoutId?: string | null;
  circlePayoutId?: string | null;
  payoutRail?: string | null;
}, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    intentId: intent.id,
    vendorId: intent.vendorId ?? null,
    amountMinor: intent.amountMinor.toString(),
    currency: intent.currency,
    status: intent.status,
    provider: intent.provider,
    providerPayoutId: (intent.providerPayoutId ?? intent.circlePayoutId ?? null),
    payoutRail: intent.payoutRail ?? null,
    ...extra,
  };
}

export function formatSSEMessage(
  event: { id: string; type: string; payload: unknown; createdAt: Date | string }
): string {
  const data = JSON.stringify({
    id: event.id,
    type: event.type,
    payload: event.payload,
    createdAt: typeof event.createdAt === "string"
      ? event.createdAt
      : event.createdAt.toISOString(),
  });
  return `event: treasury\ndata: ${data}\n\n`;
}

export function formatSSEPing(): string {
  return `: ping ${new Date().toISOString()}\n\n`;
}
