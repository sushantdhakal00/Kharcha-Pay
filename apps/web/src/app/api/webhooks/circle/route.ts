import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TreasuryDepositIntentStatus } from "@prisma/client";
import {
  verifyCircleWebhook,
  parseCircleWebhook,
  mapCircleStatusToIntent,
  isPayoutEvent,
} from "@/lib/fiat/circle-webhook";
import { reconcileDepositIntent } from "@/lib/treasury/treasury-deposit-reconcile";
import {
  assertValidPayoutTransition,
  InvalidPayoutTransitionError,
} from "@/lib/fiat/payout-state-machine";
import { logTreasuryAudit } from "@/lib/fiat/treasury-audit";
import { createHash } from "crypto";
import { normalizeCircleStatus } from "@/lib/fiat/payout-providers/circle/circle-provider";
import { _writeLedgerForTransition } from "@/lib/fiat/fiat-payout-service";
import {
  emitTreasuryEvent,
  payoutStatusDedupKey,
  buildPayoutEventPayload,
} from "@/lib/fiat/treasury-events";

function computePayloadHash(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex")
    .slice(0, 32);
}

function deriveStableEventId(body: unknown): string {
  return `derived-${computePayloadHash(body)}`;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-circle-webhook-secret");
  if (!verifyCircleWebhook(secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseCircleWebhook(body);
  if (!parsed) {
    return NextResponse.json({ error: "Unrecognized payload" }, { status: 400 });
  }

  const {
    eventId: rawEventId,
    eventType,
    objectId,
    status: rawStatus,
    failureCode,
    failureMessage,
  } = parsed;

  const eventId = rawEventId || deriveStableEventId(body);

  try {
    let isDuplicate = false;
    try {
      await prisma.processedWebhookEvent.create({
        data: {
          id: eventId,
          type: eventType,
          payloadHash: computePayloadHash(body),
        },
      });
    } catch (e: unknown) {
      const prismaError = e as { code?: string };
      if (prismaError.code === "P2002") {
        isDuplicate = true;
      } else {
        throw e;
      }
    }

    if (isDuplicate) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    await prisma.circleWebhookEvent.create({
      data: {
        provider: "CIRCLE",
        eventId,
        eventType,
        circleObjectId: objectId,
        payloadJson: body as object,
      },
    });

    if (isPayoutEvent(eventType)) {
      return await handlePayoutEvent(
        eventId,
        eventType,
        objectId,
        rawStatus,
        failureCode,
        failureMessage
      );
    }

    return await handleDepositEvent(objectId, rawStatus);
  } catch (e) {
    console.error("[webhooks/circle]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleDepositEvent(
  objectId: string,
  rawStatus: string | undefined
): Promise<NextResponse> {
  const intent = await prisma.treasuryDepositIntent.findFirst({
    where: { circleIntentId: objectId },
  });

  if (!intent) {
    return NextResponse.json({ ok: true, matched: false });
  }

  const previousStatus = intent.status;
  const newStatus = mapCircleStatusToIntent(rawStatus);
  if (newStatus && newStatus !== previousStatus) {
    await prisma.treasuryDepositIntent.update({
      where: { id: intent.id },
      data: { status: newStatus },
    });
  }

  const justCompleted =
    newStatus === TreasuryDepositIntentStatus.COMPLETED &&
    previousStatus !== TreasuryDepositIntentStatus.COMPLETED;

  if (justCompleted) {
    try {
      await reconcileDepositIntent(intent.orgId, intent.id);
    } catch {
      // RPC unavailable; keep COMPLETED, reconcile later manually
    }
  }

  return NextResponse.json({ ok: true, matched: true });
}

async function handlePayoutEvent(
  eventId: string,
  eventType: string,
  objectId: string,
  rawStatus: string | undefined,
  failureCode: string | undefined,
  failureMessage: string | undefined
): Promise<NextResponse> {
  // Look up by provider+providerPayoutId first, fall back to circlePayoutId
  let payout = await prisma.treasuryPayoutIntent.findFirst({
    where: { provider: "CIRCLE", providerPayoutId: objectId },
  });
  if (!payout) {
    payout = await prisma.treasuryPayoutIntent.findFirst({
      where: { circlePayoutId: objectId },
    });
  }

  if (!payout) {
    return NextResponse.json({ ok: true, matched: false });
  }

  await logTreasuryAudit({
    orgId: payout.orgId,
    action: "WEBHOOK_RECEIVED",
    entityType: "TreasuryPayoutIntent",
    entityId: payout.id,
    metadata: {
      eventId,
      eventType,
      provider: "CIRCLE",
      providerPayoutId: objectId,
    },
  });

  const normalizedStatus = normalizeCircleStatus(rawStatus);
  const newStatus = normalizedStatus
    ? (normalizedStatus as typeof payout.status)
    : null;
  const updateData: Record<string, unknown> = {
    providerStatusRaw: rawStatus ?? null,
  };

  if (newStatus && newStatus !== payout.status) {
    try {
      assertValidPayoutTransition(payout.status, newStatus);
      updateData.status = newStatus;
    } catch (e) {
      if (e instanceof InvalidPayoutTransitionError) {
        console.warn(
          `[webhooks/circle] Blocked invalid transition: ${payout.status} → ${newStatus} for payout ${payout.id}`
        );
        return NextResponse.json({
          ok: true,
          matched: true,
          transitionBlocked: true,
        });
      }
      throw e;
    }
  }

  if (failureCode) updateData.failureCode = failureCode;
  if (failureMessage) updateData.failureMessage = failureMessage;

  if (Object.keys(updateData).length > 0) {
    await prisma.treasuryPayoutIntent.update({
      where: { id: payout.id },
      data: updateData,
    });

    if (updateData.status && newStatus) {
      const action =
        newStatus === "FAILED" ? "PAYOUT_FAILED" : "PAYOUT_STATUS_CHANGED";
      await logTreasuryAudit({
        orgId: payout.orgId,
        action,
        entityType: "TreasuryPayoutIntent",
        entityId: payout.id,
        metadata: {
          from: payout.status,
          to: newStatus,
          provider: "CIRCLE",
          failureCode: failureCode ?? null,
          source: "webhook",
        },
      });

      await _writeLedgerForTransition(payout, newStatus);

      const eventType =
        newStatus === "COMPLETED"
          ? "PAYOUT_COMPLETED"
          : newStatus === "FAILED"
            ? "PAYOUT_FAILED"
            : "PAYOUT_STATUS_CHANGED";
      await emitTreasuryEvent({
        orgId: payout.orgId,
        type: eventType as import("@prisma/client").TreasuryEventType,
        entityType: "TreasuryPayoutIntent",
        entityId: payout.id,
        dedupKey: payoutStatusDedupKey(payout.id, newStatus),
        payload: buildPayoutEventPayload(
          { ...payout, status: newStatus },
          {
            fromStatus: payout.status,
            toStatus: newStatus,
            failureCode: failureCode ?? null,
            source: "webhook",
          }
        ),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, matched: true });
}
