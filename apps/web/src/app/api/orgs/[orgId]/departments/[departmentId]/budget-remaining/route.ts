import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { RequestStatus } from "@prisma/client";
import { bigIntToString } from "@/lib/bigint";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string; departmentId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, departmentId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const { searchParams } = new URL(request.url);
    const yearStr = searchParams.get("year");
    const monthStr = searchParams.get("month");
    if (!yearStr || !monthStr) {
      return NextResponse.json(
        { error: "year and month query params required" },
        { status: 400 }
      );
    }
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Invalid year or month" },
        { status: 400 }
      );
    }

    const budget = await prisma.monthlyBudget.findUnique({
      where: {
        departmentId_year_month: { departmentId, year, month },
      },
    });
    const budgetMinor = budget?.amountMinor ?? BigInt(0);

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);
    const spentResult = await prisma.expenseRequest.aggregate({
      where: {
        departmentId,
        orgId,
        status: RequestStatus.APPROVED,
        submittedAt: { gte: monthStart, lt: monthEnd },
      },
      _sum: { amountMinor: true },
    });
    const spentApproved = spentResult._sum.amountMinor ?? BigInt(0);
    const remaining = budgetMinor - spentApproved;

    return NextResponse.json({
      budgetMinor: bigIntToString(budgetMinor),
      spentApproved: bigIntToString(spentApproved),
      remaining: bigIntToString(remaining < 0 ? BigInt(0) : remaining),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
