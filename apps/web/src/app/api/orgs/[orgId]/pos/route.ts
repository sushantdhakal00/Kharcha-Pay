import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { PurchaseOrderStatus } from "@prisma/client";
import { jsonResponse } from "@/lib/json-response";
import { logAuditEvent } from "@/lib/audit";

function toStr(b: bigint): string {
  return b.toString();
}

function serializePO(po: {
  id: string;
  orgId: string;
  poNumber: string;
  vendorId: string;
  departmentId: string | null;
  currency: string;
  subtotalMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  status: PurchaseOrderStatus;
  issuedAt: Date | null;
  expectedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  vendor?: { name: string };
  department?: { name: string } | null;
  lineItems?: Array<{ id: string; description: string; qtyOrdered: number; unitPriceMinor: bigint; totalMinor: bigint }>;
}) {
  return {
    id: po.id,
    orgId: po.orgId,
    poNumber: po.poNumber,
    vendorId: po.vendorId,
    departmentId: po.departmentId,
    currency: po.currency,
    subtotalMinor: toStr(po.subtotalMinor),
    taxMinor: toStr(po.taxMinor),
    totalMinor: toStr(po.totalMinor),
    status: po.status,
    issuedAt: po.issuedAt?.toISOString() ?? null,
    expectedAt: po.expectedAt?.toISOString() ?? null,
    createdByUserId: po.createdByUserId,
    createdAt: po.createdAt.toISOString(),
    vendorName: po.vendor?.name,
    departmentName: po.department?.name,
    lineItems: po.lineItems?.map((l) => ({
      id: l.id,
      description: l.description,
      qtyOrdered: l.qtyOrdered,
      unitPriceMinor: toStr(l.unitPriceMinor),
      totalMinor: toStr(l.totalMinor),
    })),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as PurchaseOrderStatus | null;
    const vendorId = searchParams.get("vendorId");
    const q = searchParams.get("q")?.trim();

    const where: Prisma.PurchaseOrderWhereInput = { orgId };
    if (status) where.status = status;
    if (vendorId) where.vendorId = vendorId;
    if (q) {
      where.OR = [
        { poNumber: { contains: q, mode: "insensitive" } },
        { vendor: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const pos = await prisma.purchaseOrder.findMany({
      where,
      include: {
        vendor: { select: { name: true } },
        department: { select: { name: true } },
        lineItems: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return jsonResponse({ pos: pos.map(serializePO) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const body = await request.json();
    const vendorId = body.vendorId as string;
    const departmentId = (body.departmentId as string) || null;
    const costCenterId = (body.costCenterId as string) || null;
    const projectId = (body.projectId as string) || null;
    const currency = (body.currency as string) || "NPR";
    const lineItems = Array.isArray(body.lineItems) ? body.lineItems : [];

    if (!vendorId) {
      return NextResponse.json({ error: "vendorId required" }, { status: 400 });
    }

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, orgId } });
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 400 });
    }
    if (departmentId) {
      const dept = await prisma.department.findFirst({ where: { id: departmentId, orgId } });
      if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 400 });
    }

    const count = await prisma.purchaseOrder.count({ where: { orgId } });
    const poNumber = `PO-${String(count + 1).padStart(6, "0")}`;

    let subtotalMinor = BigInt(0);
    const lineItemData = lineItems.map((li: { description: string; qtyOrdered: number; unitPriceMinor: string }) => {
      const qty = Math.max(0, Number(li.qtyOrdered) || 0);
      const unit = BigInt(li.unitPriceMinor ?? 0);
      const total = unit * BigInt(qty);
      subtotalMinor += total;
      return {
        description: String(li.description || "").trim() || "Line item",
        qtyOrdered: qty,
        unitPriceMinor: unit,
        totalMinor: total,
      };
    });

    const taxMinor = BigInt(0);
    const totalMinor = subtotalMinor + taxMinor;

    const po = await prisma.purchaseOrder.create({
      data: {
        orgId,
        poNumber,
        vendorId,
        departmentId,
        costCenterId,
        projectId,
        currency,
        subtotalMinor,
        taxMinor,
        totalMinor,
        status: PurchaseOrderStatus.DRAFT,
        createdByUserId: user.id,
        lineItems: {
          create: lineItemData,
        },
      },
      include: {
        vendor: { select: { name: true } },
        department: { select: { name: true } },
        lineItems: true,
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "PO_CREATED",
      entityType: "PurchaseOrder",
      entityId: po.id,
      after: { poNumber: po.poNumber, vendorId, totalMinor: toStr(totalMinor) },
    });

    return jsonResponse({ po: serializePO(po) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
