import { NextRequest, NextResponse } from "next/server";
import { TreasuryRiskStatus } from "@prisma/client";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import {
  createPayoutIntent,
  fundOnChainIfRequired,
  PayoutFundingUnsupportedError,
} from "@/lib/fiat/fiat-payout-service";
import { logTreasuryAudit } from "@/lib/fiat/treasury-audit";
import {
  emitTreasuryEvent,
  approvalDecidedDedupKey,
  buildPayoutEventPayload,
} from "@/lib/fiat/treasury-events";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; payoutIntentId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, payoutIntentId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const intent = await prisma.treasuryPayoutIntent.findFirst({
      where: { id: payoutIntentId, orgId },
    });
    if (!intent) {
      return jsonResponse({ error: "Payout intent not found" }, { status: 404 });
    }

    if (intent.riskStatus !== TreasuryRiskStatus.REQUIRES_APPROVAL) {
      return jsonResponse(
        { error: "Payout does not require approval", code: "NOT_PENDING_APPROVAL" },
        { status: 400 }
      );
    }

    const approval = await prisma.treasuryPayoutApproval.findUnique({
      where: { intentId: payoutIntentId },
    });
    if (!approval) {
      return jsonResponse({ error: "Approval record not found" }, { status: 404 });
    }

    if (approval.status === "APPROVED") {
      return jsonResponse({
        id: intent.id,
        status: intent.status,
        riskStatus: intent.riskStatus,
        approvalStatus: "APPROVED",
        message: "Already approved",
      });
    }

    if (approval.status === "REJECTED") {
      return jsonResponse(
        { error: "Cannot approve a rejected payout", code: "ALREADY_REJECTED" },
        { status: 409 }
      );
    }

    const now = new Date();
    await prisma.treasuryPayoutApproval.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        approvedByUserId: user.id,
        decidedAt: now,
      },
    });

    await prisma.treasuryPayoutIntent.update({
      where: { id: intent.id },
      data: {
        riskStatus: TreasuryRiskStatus.CLEAR,
        approvedAt: now,
      },
    });

    await logTreasuryAudit({
      orgId,
      actorId: user.id,
      action: "PAYOUT_APPROVED",
      entityType: "TreasuryPayoutIntent",
      entityId: intent.id,
      metadata: {
        approvalId: approval.id,
        amountMinor: intent.amountMinor.toString(),
      },
    });

    await emitTreasuryEvent({
      orgId,
      type: "PAYOUT_APPROVED",
      entityType: "TreasuryPayoutIntent",
      entityId: intent.id,
      dedupKey: approvalDecidedDedupKey(intent.id, "APPROVED"),
      payload: buildPayoutEventPayload(intent, {
        approvalId: approval.id,
        approvedByUserId: user.id,
      }),
    }).catch(() => {});

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true },
    });

    let executedIntent;
    try {
      executedIntent = await createPayoutIntent({
        orgId,
        orgName: org.name,
        vendorId: intent.vendorId ?? undefined,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        createdByUserId: intent.createdByUserId,
        note: intent.note ?? undefined,
        idempotencyKey: intent.idempotencyKey
          ? `approved:${intent.idempotencyKey}`
          : `approved:${intent.id}`,
        payoutRail: intent.payoutRail,
        provider: intent.provider,
      });
    } catch {
      return jsonResponse({
        id: intent.id,
        status: intent.status,
        riskStatus: "CLEAR",
        approvalStatus: "APPROVED",
        message: "Approved but provider submission failed; will retry on next reconciliation",
      });
    }

    let fundingNote: string | undefined;
    try {
      await fundOnChainIfRequired(orgId, executedIntent.id);
    } catch (e) {
      if (e instanceof PayoutFundingUnsupportedError) {
        fundingNote = e.message;
      }
    }

    if (executedIntent.id !== intent.id) {
      await prisma.treasuryPayoutIntent.update({
        where: { id: intent.id },
        data: {
          status: executedIntent.status,
          providerPayoutId: executedIntent.providerPayoutId,
          circlePayoutId: executedIntent.circlePayoutId,
        },
      });
    }

    return jsonResponse({
      id: intent.id,
      status: executedIntent.status,
      riskStatus: "CLEAR",
      approvalStatus: "APPROVED",
      providerPayoutId: executedIntent.providerPayoutId,
      fundingNote,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
