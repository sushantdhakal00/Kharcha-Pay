import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { InvoiceStatus } from "@prisma/client";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { emitOutboxEvent } from "@/lib/outbox";
import { enqueueAccountingSyncJob } from "@/lib/accounting/enqueue-job";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, id } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN, OrgRole.APPROVER]);

    const body = await req.json().catch(() => ({}));
    const reason = (body.reason as string) || null;

    const inv = await prisma.invoice.findFirst({
      where: { id, orgId },
    });
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    const allowedFrom: InvoiceStatus[] = [InvoiceStatus.NEEDS_VERIFICATION, InvoiceStatus.EXCEPTION];
    if (!allowedFrom.includes(inv.status)) {
      return NextResponse.json(
        { error: "Only invoices in NEEDS_VERIFICATION or EXCEPTION can be verified" },
        { status: 400 }
      );
    }
    if (!inv.glCode) {
      return NextResponse.json(
        { error: "GL code required before verification" },
        { status: 400 }
      );
    }

    const now = new Date();
    await prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.VERIFIED,
        verifiedByUserId: user.id,
        verifiedAt: now,
      },
    });

    const wasException = inv.status === InvoiceStatus.EXCEPTION;
    await emitOutboxEvent({
      orgId,
      type: "INVOICE_VERIFIED",
      payload: { invoiceId: id, verifiedByUserId: user.id, verifiedAt: now.toISOString(), wasException },
    });
    if (wasException) {
      await emitOutboxEvent({
        orgId,
        type: "MATCH_EXCEPTION_RESOLVED",
        payload: { invoiceId: id, verifiedByUserId: user.id },
      });
    }
    await enqueueAccountingSyncJob(orgId, "EXPORT_BILLS", { invoiceId: id });
    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: wasException ? "INVOICE_EXCEPTION_RESOLVED" : "INVOICE_VERIFIED",
      entityType: "Invoice",
      entityId: id,
      before: { status: inv.status },
      after: { status: InvoiceStatus.VERIFIED, verifiedByUserId: user.id, verifiedAt: now.toISOString() },
      metadata: reason ? { reason } : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
