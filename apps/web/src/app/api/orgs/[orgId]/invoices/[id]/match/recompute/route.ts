import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { matchInvoice } from "@/lib/match-engine";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, id } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN, OrgRole.APPROVER]);

    const inv = await prisma.invoice.findFirst({
      where: { id, orgId },
    });
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (inv.status !== "SUBMITTED" && inv.status !== "EXCEPTION" && inv.status !== "NEEDS_VERIFICATION") {
      return NextResponse.json(
        { error: "Only submitted/exception/needs_verification invoices can have match recomputed" },
        { status: 400 }
      );
    }

    const matchResult = await matchInvoice(id);

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "MATCH_COMPUTED",
      entityType: "MatchResult",
      entityId: id,
      metadata: { matchType: matchResult.matchType, status: matchResult.status, recomputed: true },
    });

    return NextResponse.json({ ok: true, matchResult });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
