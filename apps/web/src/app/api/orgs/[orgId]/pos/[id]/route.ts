import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { jsonResponse } from "@/lib/json-response";

function toStr(b: bigint): string {
  return b.toString();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, id } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const po = await prisma.purchaseOrder.findFirst({
      where: { id, orgId },
      include: {
        vendor: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        lineItems: true,
        createdBy: { select: { username: true } },
      },
    });
    if (!po) {
      return NextResponse.json({ error: "PO not found" }, { status: 404 });
    }

    return jsonResponse({
      po: {
        id: po.id,
        poNumber: po.poNumber,
        vendorId: po.vendorId,
        vendorName: po.vendor.name,
        departmentId: po.departmentId,
        departmentName: po.department?.name,
        costCenterId: po.costCenterId,
        projectId: po.projectId,
        currency: po.currency,
        subtotalMinor: toStr(po.subtotalMinor),
        taxMinor: toStr(po.taxMinor),
        totalMinor: toStr(po.totalMinor),
        status: po.status,
        issuedAt: po.issuedAt?.toISOString() ?? null,
        expectedAt: po.expectedAt?.toISOString() ?? null,
        createdByUserId: po.createdByUserId,
        createdByUsername: po.createdBy.username,
        createdAt: po.createdAt.toISOString(),
        lineItems: po.lineItems.map((l) => ({
          id: l.id,
          description: l.description,
          qtyOrdered: l.qtyOrdered,
          unitPriceMinor: toStr(l.unitPriceMinor),
          totalMinor: toStr(l.totalMinor),
        })),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
