import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { buildPayoutTimeline } from "@/lib/fiat/payout-timeline";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ orgId: string; payoutIntentId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, payoutIntentId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const intent = await prisma.treasuryPayoutIntent.findFirst({
      where: { id: payoutIntentId, orgId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        onchainTxSig: true,
        failureCode: true,
        failureMessage: true,
      },
    });

    if (!intent) {
      return jsonResponse({ error: "Payout intent not found" }, { status: 404 });
    }

    const auditLogs = await prisma.treasuryAuditLog.findMany({
      where: {
        entityType: "TreasuryPayoutIntent",
        entityId: payoutIntentId,
        orgId,
      },
      orderBy: { createdAt: "asc" },
      select: {
        action: true,
        createdAt: true,
        metadata: true,
      },
    });

    const timeline = buildPayoutTimeline(intent, auditLogs);

    return jsonResponse({ timeline });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
