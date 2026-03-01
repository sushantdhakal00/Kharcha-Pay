/**
 * GET /api/orgs/[orgId]/setup-checklist
 * Returns counts for setup checklist (Admin only).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const [departments, budgets, glCodes, vendors, pos, invoices, qbo] = await Promise.all([
      prisma.department.count({ where: { orgId } }),
      prisma.monthlyBudget.count({ where: { orgId } }),
      prisma.orgGLCode.count({ where: { orgId } }),
      prisma.vendor.count({ where: { orgId } }),
      prisma.purchaseOrder.count({ where: { orgId } }),
      prisma.invoice.count({ where: { orgId } }),
      prisma.accountingConnection.findFirst({
        where: { orgId, provider: "QUICKBOOKS_ONLINE", status: "CONNECTED" },
        select: { id: true },
      }),
    ]);

    return NextResponse.json({
      departments,
      budgets,
      glCodes,
      vendors,
      purchaseOrders: pos,
      invoices,
      hasQbo: !!qbo,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
