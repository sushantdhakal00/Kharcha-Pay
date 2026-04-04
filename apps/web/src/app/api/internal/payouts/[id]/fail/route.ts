import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { assertValidPayoutTransition } from "@/lib/fiat/payout-state-machine";
import { logTreasuryAudit } from "@/lib/fiat/treasury-audit";
import { TreasuryPayoutIntentStatus } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret =
    req.headers.get("x-internal-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!env.INTERNAL_JOB_SECRET || secret !== env.INTERNAL_JOB_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }

  try {
    const intent = await prisma.treasuryPayoutIntent.findUnique({
      where: { id },
      select: { id: true, orgId: true, status: true },
    });

    if (!intent) {
      return jsonResponse({ error: "Payout intent not found" }, { status: 404 });
    }

    assertValidPayoutTransition(
      intent.status,
      TreasuryPayoutIntentStatus.FAILED
    );

    const updated = await prisma.treasuryPayoutIntent.update({
      where: { id },
      data: {
        status: TreasuryPayoutIntentStatus.FAILED,
        failureCode: "ADMIN_FORCE_FAIL",
        failureMessage: body.reason ?? "Manually failed by operator",
      },
    });

    await logTreasuryAudit({
      orgId: intent.orgId,
      action: "PAYOUT_FAILED",
      entityType: "TreasuryPayoutIntent",
      entityId: id,
      metadata: {
        from: intent.status,
        to: "FAILED",
        reason: body.reason ?? "Manually failed by operator",
        source: "admin_ops",
      },
    });

    return jsonResponse({
      id: updated.id,
      status: updated.status,
      failureCode: updated.failureCode,
      failureMessage: updated.failureMessage,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.includes("Invalid payout transition") ? 409 : 500;
    return jsonResponse({ error: message }, { status });
  }
}
