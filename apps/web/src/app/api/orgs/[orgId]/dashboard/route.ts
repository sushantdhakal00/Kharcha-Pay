import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { jsonResponse } from "@/lib/json-response";
import { RequestStatus } from "@prisma/client";

/**
 * GET /api/orgs/[orgId]/dashboard?year=&month=
 * Returns: totalBudget, approvedSpend, paidSpend, remaining, burn rate, counts, topDepartments
 * Default month = current month (server time)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
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

    // Total budget for org for month (sum MonthlyBudget)
    const budgets = await prisma.monthlyBudget.findMany({
      where: { orgId, year, month },
    });
    const totalBudgetMinor = budgets.reduce((acc, b) => acc + b.amountMinor, BigInt(0));

    // approvedSpend = sum amountMinor where status in (APPROVED, PAID) and submittedAt in month
    const approvedRequests = await prisma.expenseRequest.findMany({
      where: {
        orgId,
        status: { in: [RequestStatus.APPROVED, RequestStatus.PAID] },
        OR: [
          { submittedAt: { gte: startOfMonth, lte: endOfMonth } },
          { submittedAt: null, createdAt: { gte: startOfMonth, lte: endOfMonth } },
        ],
      },
      select: { amountMinor: true },
    });
    const approvedSpendMinor = approvedRequests.reduce((acc, r) => acc + r.amountMinor, BigInt(0));

    // paidSpend = sum where status=PAID and paidAt in month
    const paidRequests = await prisma.expenseRequest.findMany({
      where: {
        orgId,
        status: RequestStatus.PAID,
        paidAt: { gte: startOfMonth, lte: endOfMonth },
      },
      select: { amountMinor: true },
    });
    const paidSpendMinor = paidRequests.reduce((acc, r) => acc + r.amountMinor, BigInt(0));

    // remaining = totalBudget - approvedSpend (clamp at 0 for display)
    let remainingMinor = totalBudgetMinor - approvedSpendMinor;
    if (remainingMinor < BigInt(0)) remainingMinor = BigInt(0);

    // Burn rate: approved or paid per month (same as approvedSpend for this month view)
    const burnRateMinor = approvedSpendMinor;

    // Counts
    const allMonthRequests = await prisma.expenseRequest.findMany({
      where: {
        orgId,
        OR: [
          { submittedAt: { gte: startOfMonth, lte: endOfMonth } },
          { submittedAt: null, createdAt: { gte: startOfMonth, lte: endOfMonth } },
        ],
      },
      select: { status: true, paidAt: true },
    });
    const pendingCount = allMonthRequests.filter((r) => r.status === RequestStatus.PENDING).length;
    const approvedCount = allMonthRequests.filter((r) => r.status === RequestStatus.APPROVED).length;
    const rejectedCount = allMonthRequests.filter((r) => r.status === RequestStatus.REJECTED).length;
    const paidCount = allMonthRequests.filter((r) => r.status === RequestStatus.PAID).length;

    const membership = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });
    const canApprove = membership?.role === "ADMIN" || membership?.role === "APPROVER";
    let pendingApprovalsCount = 0;
    if (canApprove) {
      const pendingRequestIds = await prisma.expenseRequest.findMany({
        where: { orgId, status: RequestStatus.PENDING, requesterUserId: { not: user.id } },
        select: { id: true },
      });
      const ids = pendingRequestIds.map((r) => r.id);
      const alreadyActed = ids.length
        ? await prisma.approvalAction.count({
            where: { requestId: { in: ids }, actorUserId: user.id },
          })
        : 0;
      pendingApprovalsCount = ids.length - alreadyActed;
    }

    // Top departments by spend (approved + paid)
    const deptSpend = await prisma.expenseRequest.groupBy({
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

    const deptIds = deptSpend.map((d) => d.departmentId);
    const departments = await prisma.department.findMany({
      where: { id: { in: deptIds } },
      select: { id: true, name: true },
    });
    const deptMap = Object.fromEntries(departments.map((d) => [d.id, d.name]));

    const topDepartments = deptSpend
      .map((d) => ({
        departmentId: d.departmentId,
        departmentName: deptMap[d.departmentId] ?? d.departmentId,
        approvedSpendMinor: (d._sum.amountMinor ?? BigInt(0)).toString(),
      }))
      .sort((a, b) => Number(BigInt(b.approvedSpendMinor) - BigInt(a.approvedSpendMinor)))
      .slice(0, 10);

    // Per-department: budget, approvedSpend, paidSpend, remaining
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

    const departmentsTable = deptBudgets.map((b) => {
      const approved = deptApprovedMap[b.departmentId] ?? BigInt(0);
      const paid = deptPaidMap[b.departmentId] ?? BigInt(0);
      let rem = b.amountMinor - approved;
      if (rem < BigInt(0)) rem = BigInt(0);
      return {
        departmentId: b.departmentId,
        departmentName: b.department.name,
        budgetMinor: b.amountMinor.toString(),
        approvedSpendMinor: approved.toString(),
        paidSpendMinor: paid.toString(),
        remainingMinor: rem.toString(),
      };
    });

    return jsonResponse({
      year,
      month,
      totalBudgetMinor: totalBudgetMinor.toString(),
      approvedSpendMinor: approvedSpendMinor.toString(),
      paidSpendMinor: paidSpendMinor.toString(),
      remainingMinor: remainingMinor.toString(),
      burnRateMinor: burnRateMinor.toString(),
      pendingCount,
      approvedCount,
      rejectedCount,
      paidCount,
      pendingApprovalsCount: canApprove ? pendingApprovalsCount : 0,
      topDepartments,
      departmentsTable,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
