import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { GoodsReceiptStatus } from "@prisma/client";
import { jsonResponse } from "@/lib/json-response";
import { logAuditEvent } from "@/lib/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const { searchParams } = new URL(request.url);
    const poId = searchParams.get("poId");

    const where: { orgId: string; poId?: string } = { orgId };
    if (poId) where.poId = poId;

    const receipts = await prisma.goodsReceipt.findMany({
      where,
      include: {
        po: { select: { poNumber: true } },
        receivedBy: { select: { username: true } },
        lineItems: true,
      },
      orderBy: { receivedAt: "desc" },
    });

    return jsonResponse({
      receipts: receipts.map((r) => ({
        id: r.id,
        poId: r.poId,
        poNumber: r.po?.poNumber,
        receivedAt: r.receivedAt.toISOString(),
        receivedByUserId: r.receivedByUserId,
        receivedByUsername: r.receivedBy.username,
        status: r.status,
        note: r.note,
        lineItems: r.lineItems.map((l) => ({
          poLineItemId: l.poLineItemId,
          qtyReceived: l.qtyReceived,
        })),
        createdAt: r.createdAt.toISOString(),
      })),
    });
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
    const poId = body.poId as string;
    const note = (body.note as string) || null;
    const lineItems = Array.isArray(body.lineItems) ? body.lineItems : [];

    if (!poId) {
      return NextResponse.json({ error: "poId required" }, { status: 400 });
    }

    const po = await prisma.purchaseOrder.findFirst({
      where: { id: poId, orgId },
      include: { lineItems: true },
    });
    if (!po) {
      return NextResponse.json({ error: "PO not found" }, { status: 404 });
    }
    if (po.status === "DRAFT") {
      return NextResponse.json({ error: "Cannot receive against draft PO" }, { status: 400 });
    }

    const poLineIds = new Set(po.lineItems.map((l) => l.id));
    const grnLineData = lineItems
      .filter((li: { poLineItemId: string; qtyReceived: number }) => poLineIds.has(li.poLineItemId))
      .map((li: { poLineItemId: string; qtyReceived: number }) => ({
        poLineItemId: li.poLineItemId,
        qtyReceived: Math.max(0, Number(li.qtyReceived) || 0),
      }));

    const grn = await prisma.goodsReceipt.create({
      data: {
        orgId,
        poId,
        receivedByUserId: user.id,
        status: GoodsReceiptStatus.DRAFT,
        note,
        lineItems: { create: grnLineData },
      },
      include: {
        po: { select: { poNumber: true } },
        receivedBy: { select: { username: true } },
        lineItems: true,
      },
    });

    return jsonResponse({
      receipt: {
        id: grn.id,
        poId: grn.poId,
        poNumber: grn.po.poNumber,
        receivedAt: grn.receivedAt.toISOString(),
        receivedByUserId: grn.receivedByUserId,
        receivedByUsername: grn.receivedBy.username,
        status: grn.status,
        note: grn.note,
        lineItems: grn.lineItems.map((l) => ({ poLineItemId: l.poLineItemId, qtyReceived: l.qtyReceived })),
        createdAt: grn.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
