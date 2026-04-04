import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { GoodsReceiptStatus, PurchaseOrderStatus } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(_request);
    const { orgId, id } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const grn = await prisma.goodsReceipt.findFirst({
      where: { id, orgId },
      include: { po: true, lineItems: true },
    });
    if (!grn) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }
    if (grn.status !== GoodsReceiptStatus.DRAFT) {
      return NextResponse.json({ error: "Only draft receipts can be submitted" }, { status: 400 });
    }

    await prisma.goodsReceipt.update({
      where: { id },
      data: { status: GoodsReceiptStatus.SUBMITTED },
    });

    // Update PO status based on received vs ordered quantities
    const po = grn.po;
    const poLines = await prisma.purchaseOrderLineItem.findMany({
      where: { poId: po.id },
    });
    const grnByLine = new Map(grn.lineItems.map((l) => [l.poLineItemId, l.qtyReceived]));
    let allReceived = true;
    let anyReceived = false;
    for (const pl of poLines) {
      const received = grnByLine.get(pl.id) ?? 0;
      if (received > 0) anyReceived = true;
      if (received < pl.qtyOrdered) allReceived = false;
    }
    let newPoStatus = po.status;
    if (allReceived && anyReceived) newPoStatus = PurchaseOrderStatus.RECEIVED;
    else if (anyReceived) newPoStatus = PurchaseOrderStatus.PARTIALLY_RECEIVED;
    if (newPoStatus !== po.status) {
      await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { status: newPoStatus },
      });
    }

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "RECEIPT_SUBMITTED",
      entityType: "GoodsReceipt",
      entityId: id,
      after: { poId: grn.poId, status: GoodsReceiptStatus.SUBMITTED },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
