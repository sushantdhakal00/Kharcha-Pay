import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { InvoiceStatus } from "@prisma/client";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { emitOutboxEvent } from "@/lib/outbox";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { orgId, id } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN, OrgRole.APPROVER]);

    const body = await request.json().catch(() => ({}));
    const reason = (body.reason as string) || null;

    const inv = await prisma.invoice.findFirst({
      where: { id, orgId },
    });
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    const allowedFrom: InvoiceStatus[] = [
      InvoiceStatus.SUBMITTED,
      InvoiceStatus.NEEDS_VERIFICATION,
      InvoiceStatus.EXCEPTION,
    ];
    if (!allowedFrom.includes(inv.status)) {
      return NextResponse.json(
        { error: "Only submitted/verification/exception invoices can be rejected" },
        { status: 400 }
      );
    }

    await prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.REJECTED },
    });

    await emitOutboxEvent({
      orgId,
      type: "INVOICE_REJECTED",
      payload: { invoiceId: id, rejectedByUserId: user.id, reason },
    });
    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "INVOICE_REJECTED",
      entityType: "Invoice",
      entityId: id,
      before: { status: inv.status },
      after: { status: InvoiceStatus.REJECTED },
      metadata: reason ? { reason } : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
