import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { PurchaseOrderStatus } from "@prisma/client";
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

    const po = await prisma.purchaseOrder.findFirst({
      where: { id, orgId },
    });
    if (!po) {
      return NextResponse.json({ error: "PO not found" }, { status: 404 });
    }
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      return NextResponse.json({ error: "Only draft POs can be issued" }, { status: 400 });
    }

    const now = new Date();
    await prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.ISSUED, issuedAt: now },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "PO_ISSUED",
      entityType: "PurchaseOrder",
      entityId: id,
      before: { status: po.status },
      after: { status: PurchaseOrderStatus.ISSUED, issuedAt: now.toISOString() },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
