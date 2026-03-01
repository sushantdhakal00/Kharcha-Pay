import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { InvoiceStatus } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { emitOutboxEvent } from "@/lib/outbox";
import { matchInvoice } from "@/lib/match-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, id } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const inv = await prisma.invoice.findFirst({
      where: { id, orgId },
    });
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (inv.status !== InvoiceStatus.DRAFT) {
      return NextResponse.json({ error: "Only draft invoices can be submitted" }, { status: 400 });
    }
    if (inv.createdByUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!inv.departmentId || !inv.glCode) {
      return NextResponse.json(
        { error: "Department and GL code required before submit" },
        { status: 400 }
      );
    }

    const now = new Date();
    const nextStatus: InvoiceStatus =
      inv.type === "NON_PO_INVOICE" ? InvoiceStatus.NEEDS_VERIFICATION : InvoiceStatus.SUBMITTED;

    await prisma.invoice.update({
      where: { id },
      data: { status: nextStatus, submittedAt: now },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "INVOICE_SUBMITTED",
      entityType: "Invoice",
      entityId: id,
      before: { status: inv.status },
      after: { status: nextStatus, submittedAt: now.toISOString() },
    });
    await emitOutboxEvent({
      orgId,
      type: "INVOICE_SUBMITTED",
      payload: { invoiceId: id, status: nextStatus, submittedAt: now.toISOString() },
    });

    const matchResult = await matchInvoice(id);

    if (matchResult.status === "MISMATCH" || matchResult.status === "PARTIAL") {
      await emitOutboxEvent({
        orgId,
        type: "MATCH_EXCEPTION_CREATED",
        payload: { invoiceId: id, matchStatus: matchResult.status, diffsCount: matchResult.diffs.length },
      });
      await logAuditEvent({
        orgId,
        actorUserId: undefined,
        action: "INVOICE_EXCEPTION_CREATED",
        entityType: "Invoice",
        entityId: id,
        metadata: { matchStatus: matchResult.status, diffsCount: matchResult.diffs.length },
      });
    }

    await logAuditEvent({
      orgId,
      actorUserId: undefined,
      action: "MATCH_COMPUTED",
      entityType: "MatchResult",
      entityId: id,
      metadata: { matchType: matchResult.matchType, status: matchResult.status },
    });

    return NextResponse.json({ ok: true, matchResult });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
