import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { OrgRole } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN, OrgRole.APPROVER]);

    const t = await prisma.orgMatchTolerance.findUnique({
      where: { orgId },
    });

    return jsonResponse({
      tolerance: t
        ? {
            qtyTolerancePct: Number(t.qtyTolerancePct),
            priceTolerancePct: Number(t.priceTolerancePct),
            amountTolerancePct: Number(t.amountTolerancePct),
          }
        : {
            qtyTolerancePct: 2,
            priceTolerancePct: 1,
            amountTolerancePct: 1,
          },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await req.json().catch(() => ({}));
    const qty = Math.max(0, Math.min(100, Number(body.qtyTolerancePct) || 2));
    const price = Math.max(0, Math.min(100, Number(body.priceTolerancePct) || 1));
    const amount = Math.max(0, Math.min(100, Number(body.amountTolerancePct) || 1));

    await prisma.orgMatchTolerance.upsert({
      where: { orgId },
      create: {
        orgId,
        qtyTolerancePct: new Decimal(qty),
        priceTolerancePct: new Decimal(price),
        amountTolerancePct: new Decimal(amount),
      },
      update: {
        qtyTolerancePct: new Decimal(qty),
        priceTolerancePct: new Decimal(price),
        amountTolerancePct: new Decimal(amount),
      },
    });

    return jsonResponse({
      tolerance: { qtyTolerancePct: qty, priceTolerancePct: price, amountTolerancePct: amount },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
