import { TreasuryPayoutIntentStatus, TreasuryRiskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mapCirclePayoutStatus } from "@/lib/fiat/fiat-payout-service";
import {
  assertValidPayoutTransition,
  InvalidPayoutTransitionError,
  isTerminalStatus,
} from "@/lib/fiat/payout-state-machine";
import { logTreasuryAudit } from "@/lib/fiat/treasury-audit";
import { getPayoutProvider, ProviderError } from "@/lib/fiat/payout-providers";
import { _writeLedgerForTransition } from "@/lib/fiat/fiat-payout-service";
import {
  emitTreasuryEvent,
  payoutStatusDedupKey,
  buildPayoutEventPayload,
} from "@/lib/fiat/treasury-events";

const NON_TERMINAL_STATUSES: TreasuryPayoutIntentStatus[] = [
  TreasuryPayoutIntentStatus.PENDING,
  TreasuryPayoutIntentStatus.SENT_ONCHAIN,
  TreasuryPayoutIntentStatus.PROCESSING,
];

const MAX_BACKOFF_MS = 30 * 60 * 1000;
const BASE_BACKOFF_MS = 60 * 1000;

export function computeBackoffMs(retryCount: number): number {
  const ms = BASE_BACKOFF_MS * Math.pow(2, retryCount);
  return Math.min(ms, MAX_BACKOFF_MS);
}

export function selectEligibleIntentsFilter() {
  const now = new Date();
  return {
    status: { in: NON_TERMINAL_STATUSES },
    riskStatus: { not: TreasuryRiskStatus.REQUIRES_APPROVAL },
    OR: [
      { providerPayoutId: { not: null } },
      { circlePayoutId: { not: null } },
    ],
    AND: [
      {
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: now } },
        ],
      },
    ],
  };
}

export interface ReconcileResult {
  processed: number;
  updated: number;
  failed: number;
  errors: Array<{ intentId: string; error: string }>;
}

export async function runPayoutReconciliationOnce(): Promise<ReconcileResult> {
  const intents = await prisma.treasuryPayoutIntent.findMany({
    where: selectEligibleIntentsFilter(),
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const result: ReconcileResult = {
    processed: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };

  for (const intent of intents) {
    result.processed++;
    try {
      await reconcileSingleIntent(intent);
      result.updated++;
    } catch (e) {
      result.failed++;
      const message = e instanceof Error ? e.message : "Unknown error";
      result.errors.push({ intentId: intent.id, error: message });
    }
  }

  return result;
}

export async function reconcileSingleIntent(
  intent: {
    id: string;
    orgId: string;
    provider: string;
    status: TreasuryPayoutIntentStatus;
    amountMinor: bigint;
    currency: string;
    payoutRail: string;
    providerPayoutId: string | null;
    circlePayoutId: string | null;
    retryCount: number;
  }
): Promise<void> {
  const ppid = intent.providerPayoutId ?? intent.circlePayoutId;
  if (!ppid) return;
  if (isTerminalStatus(intent.status)) return;

  const providerImpl = getPayoutProvider(intent.provider);

  let providerResult;
  try {
    providerResult = await providerImpl.getPayout(ppid);
  } catch (e) {
    if (e instanceof ProviderError && e.classification === "TRANSIENT") {
      const newRetryCount = intent.retryCount + 1;
      const backoffMs = computeBackoffMs(newRetryCount);
      await prisma.treasuryPayoutIntent.update({
        where: { id: intent.id },
        data: {
          retryCount: newRetryCount,
          nextRetryAt: new Date(Date.now() + backoffMs),
          lastStatusRefreshAt: new Date(),
        },
      });
      throw e;
    }
    throw e;
  }

  const newStatus = providerResult.status as TreasuryPayoutIntentStatus;

  const updateData: Record<string, unknown> = {
    lastStatusRefreshAt: new Date(),
    retryCount: 0,
    nextRetryAt: null,
    providerStatusRaw: providerResult.rawStatus,
  };

  if (newStatus && newStatus !== intent.status) {
    try {
      assertValidPayoutTransition(intent.status, newStatus);
      updateData.status = newStatus;
    } catch (e) {
      if (e instanceof InvalidPayoutTransitionError) {
        console.warn(
          `[reconciler] Blocked invalid transition: ${intent.status} → ${newStatus} for ${intent.id}`
        );
        return;
      }
      throw e;
    }
  }

  await prisma.treasuryPayoutIntent.update({
    where: { id: intent.id },
    data: updateData,
  });

  if (updateData.status) {
    const action =
      newStatus === "FAILED" ? "PAYOUT_FAILED" : "PAYOUT_STATUS_CHANGED";
    await logTreasuryAudit({
      orgId: intent.orgId,
      action,
      entityType: "TreasuryPayoutIntent",
      entityId: intent.id,
      metadata: {
        from: intent.status,
        to: newStatus,
        provider: intent.provider,
        rawStatus: providerResult.rawStatus,
        source: "reconciler",
      },
    });

    await _writeLedgerForTransition(
      intent as Parameters<typeof _writeLedgerForTransition>[0],
      newStatus
    );

    const eventType =
      newStatus === "COMPLETED"
        ? "PAYOUT_COMPLETED"
        : newStatus === "FAILED"
          ? "PAYOUT_FAILED"
          : "PAYOUT_STATUS_CHANGED";
    await emitTreasuryEvent({
      orgId: intent.orgId,
      type: eventType as import("@prisma/client").TreasuryEventType,
      entityType: "TreasuryPayoutIntent",
      entityId: intent.id,
      dedupKey: payoutStatusDedupKey(intent.id, newStatus),
      payload: buildPayoutEventPayload(
        { ...intent, status: newStatus } as Parameters<typeof buildPayoutEventPayload>[0],
        { fromStatus: intent.status, toStatus: newStatus, source: "reconciler" }
      ),
    }).catch(() => {});
  }
}
