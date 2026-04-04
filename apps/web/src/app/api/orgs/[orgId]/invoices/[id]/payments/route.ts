/**
 * POST /api/orgs/[orgId]/invoices/[id]/payments
 * Record a payment against an invoice. Admin only. Emits PAYMENT_PAID and enqueues export.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { emitOutboxEvent } from "@/lib/outbox";
import { enqueueAccountingSyncJob } from "@/lib/accounting/enqueue-job";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  const user = await requireUser();
  await requireCsrf(req);
  const { orgId, id: invoiceId } = await params;
  await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

  const body = await req.json().catch(() => ({}));
  const amountMinor = body.amountMinor != null ? BigInt(String(body.amountMinor)) : null;
  const method = (body.method as string) || "BANK_TRANSFER";
  const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();

  if (amountMinor == null || amountMinor <= BigInt(0)) {
    return NextResponse.json({ error: "amountMinor required and must be positive" }, { status: 400 });
  }

  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, orgId } });
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const payment = await prisma.payment.create({
    data: {
      orgId,
      invoiceId,
      amountMinor,
      currency: inv.currency,
      paidAt,
      method,
      status: "COMPLETED",
    },
  });

  await emitOutboxEvent({
    orgId,
    type: "PAYMENT_PAID",
    payload: { paymentId: payment.id, invoiceId, amountMinor: payment.amountMinor.toString(), paidAt: paidAt.toISOString() },
  });
  await enqueueAccountingSyncJob(orgId, "EXPORT_PAYMENTS", { paymentId: payment.id });

  return NextResponse.json({ payment: { id: payment.id, amountMinor: payment.amountMinor.toString(), paidAt: payment.paidAt } });
}
