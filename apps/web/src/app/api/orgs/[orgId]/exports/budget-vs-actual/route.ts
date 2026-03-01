import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { RequestStatus } from "@prisma/client";
import { toCsv } from "@/lib/csv";
import { safeApiError } from "@/lib/safe-api-error";

/**
 * GET /api/orgs/[orgId]/exports/budget-vs-actual?year=&month=
 * Any org member. Returns CSV.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { checkRateLimit, checkGlobalLimit } = await import("@/lib/rate-limiter");
    const g = checkGlobalLimit(request);
    if (g.limited) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: g.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(g.retryAfterSeconds) } }
      );
    }
    const r = checkRateLimit(request, "export", user.id);
    if (r.limited) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: r.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } }
      );
    }
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const now = new Date();
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") ?? String(now.getFullYear()), 10);
    const month = parseInt(searchParams.get("month") ?? String(now.getMonth() + 1), 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
    }

    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const deptBudgets = await prisma.monthlyBudget.findMany({
      where: { orgId, year, month },
      include: { department: { select: { id: true, name: true } } },
    });

    const deptApproved = await prisma.expenseRequest.groupBy({
      by: ["departmentId"],
      where: {
        orgId,
        status: { in: [RequestStatus.APPROVED, RequestStatus.PAID] },
        OR: [
          { submittedAt: { gte: startOfMonth, lte: endOfMonth } },
          { submittedAt: null, createdAt: { gte: startOfMonth, lte: endOfMonth } },
        ],
      },
      _sum: { amountMinor: true },
    });
    const deptPaid = await prisma.expenseRequest.groupBy({
      by: ["departmentId"],
      where: {
        orgId,
        status: RequestStatus.PAID,
        paidAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amountMinor: true },
    });

    const deptApprovedMap = Object.fromEntries(
      deptApproved.map((d) => [d.departmentId, d._sum.amountMinor ?? BigInt(0)])
    );
    const deptPaidMap = Object.fromEntries(
      deptPaid.map((d) => [d.departmentId, d._sum.amountMinor ?? BigInt(0)])
    );

    const rows = deptBudgets.map((b) => {
      const approved = deptApprovedMap[b.departmentId] ?? BigInt(0);
      const paid = deptPaidMap[b.departmentId] ?? BigInt(0);
      let rem = b.amountMinor - approved;
      if (rem < BigInt(0)) rem = BigInt(0);
      return {
        departmentName: b.department.name,
        budgetMinor: b.amountMinor.toString(),
        approvedSpendMinor: approved.toString(),
        paidSpendMinor: paid.toString(),
        remainingMinor: rem.toString(),
      };
    });

    const headers = ["departmentName", "budgetMinor", "approvedSpendMinor", "paidSpendMinor", "remainingMinor"];
    const csv = toCsv(rows, headers);
    const filename = `budget-vs-actual-${year}-${String(month).padStart(2, "0")}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return safeApiError(e, "Export failed");
  }
}
