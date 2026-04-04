import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TreasuryRiskStatus } from "@prisma/client";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { logTreasuryAudit } from "@/lib/fiat/treasury-audit";
import {
  emitTreasuryEvent,
  approvalDecidedDedupKey,
  buildPayoutEventPayload,
} from "@/lib/fiat/treasury-events";

const rejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; payoutIntentId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, payoutIntentId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const body = await req.json().catch(() => ({}));
    const parsed = rejectSchema.safeParse(body);
    const reason = parsed.success ? parsed.data.reason : undefined;

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
      return jsonResponse(
        { error: "Cannot reject an already approved payout", code: "ALREADY_APPROVED" },
        { status: 409 }
      );
    }

    if (approval.status === "REJECTED") {
      return jsonResponse({
        id: intent.id,
        status: intent.status,
        riskStatus: intent.riskStatus,
        approvalStatus: "REJECTED",
        message: "Already rejected",
      });
    }

    const now = new Date();
    await prisma.treasuryPayoutApproval.update({
      where: { id: approval.id },
      data: {
        status: "REJECTED",
        rejectedByUserId: user.id,
        decidedAt: now,
        reason: reason ?? approval.reason,
      },
    });

    await prisma.treasuryPayoutIntent.update({
      where: { id: intent.id },
      data: {
        riskStatus: TreasuryRiskStatus.BLOCKED,
        status: "CANCELED",
      },
    });

    await logTreasuryAudit({
      orgId,
      actorId: user.id,
      action: "PAYOUT_REJECTED",
      entityType: "TreasuryPayoutIntent",
      entityId: intent.id,
      metadata: {
        approvalId: approval.id,
        reason,
        amountMinor: intent.amountMinor.toString(),
      },
    });

    await emitTreasuryEvent({
      orgId,
      type: "PAYOUT_REJECTED",
      entityType: "TreasuryPayoutIntent",
      entityId: intent.id,
      dedupKey: approvalDecidedDedupKey(intent.id, "REJECTED"),
      payload: buildPayoutEventPayload(
        { ...intent, status: "CANCELED" },
        {
          approvalId: approval.id,
          rejectedByUserId: user.id,
          reason,
        }
      ),
    }).catch(() => {});

    return jsonResponse({
      id: intent.id,
      status: "CANCELED",
      riskStatus: "BLOCKED",
      approvalStatus: "REJECTED",
      reason,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
