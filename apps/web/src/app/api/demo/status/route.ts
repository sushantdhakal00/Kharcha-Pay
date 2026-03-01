import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { RequestStatus } from "@prisma/client";

/**
 * GET /api/demo/status
 * Returns whether demo org exists, seed version, and counts.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const demoOrg = await prisma.organization.findFirst({
      where: {
        isDemo: true,
        demoOwnerUserId: user.id,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        demoSeedVersion: true,
        _count: {
          select: {
            requests: true,
            vendors: true,
          },
        },
      },
    });

    if (!demoOrg) {
      return NextResponse.json({
        exists: false,
        demoOrgId: null,
        seedVersion: null,
        counts: null,
      });
    }

    const [paidCount, verifiedCount, failedCount, budgetCount, receiptCount] = await Promise.all([
      prisma.expenseRequest.count({
        where: { orgId: demoOrg.id, status: RequestStatus.PAID },
      }),
      prisma.paymentReconciliation.count({
        where: { orgId: demoOrg.id, status: "VERIFIED" },
      }),
      prisma.paymentReconciliation.count({
        where: { orgId: demoOrg.id, status: "FAILED" },
      }),
      prisma.monthlyBudget.count({ where: { orgId: demoOrg.id } }),
      prisma.receiptFile.count({ where: { request: { orgId: demoOrg.id } } }),
    ]);

    const hasPendingApproval = await prisma.expenseRequest.count({
      where: { orgId: demoOrg.id, status: RequestStatus.PENDING },
    }) > 0;
    const hasApproved = await prisma.expenseRequest.count({
      where: { orgId: demoOrg.id, status: RequestStatus.APPROVED },
    }) > 0;

    return NextResponse.json({
      exists: true,
      demoOrgId: demoOrg.id,
      demoOrgName: demoOrg.name,
      seedVersion: demoOrg.demoSeedVersion ?? 1,
      counts: {
        requests: demoOrg._count.requests,
        vendors: demoOrg._count.vendors,
        paid: paidCount,
        verified: verifiedCount,
        failed: failedCount,
        budgets: budgetCount,
        receipts: receiptCount,
      },
      done: {
        budgets: budgetCount > 0,
        createRequest: demoOrg._count.requests > 0,
        approvals: hasPendingApproval || hasApproved || paidCount > 0,
        pay: paidCount > 0,
        reconcile: verifiedCount > 0 || failedCount > 0,
        receipts: receiptCount > 0,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
