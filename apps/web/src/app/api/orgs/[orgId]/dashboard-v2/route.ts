import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { jsonResponse } from "@/lib/json-response";
import { OrgRole, RequestStatus } from "@prisma/client";

const MAX_RANGE_DAYS = 366;
const POLICY_DEFAULTS = {
  requireReceiptForPayment: true,
  receiptRequiredAboveMinor: BigInt(0),
  blockOverBudget: true,
  allowAdminOverrideOverBudget: false,
};

function toStr(b: bigint): string {
  return b.toString();
}

function getMonthsInRange(from: Date, to: Date): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cur <= end) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function getBucketLabels(from: Date, to: Date, bucket: "day" | "week" | "month"): string[] {
  const labels: string[] = [];
  if (bucket === "month") {
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= end) {
      labels.push(cur.toISOString().slice(0, 7));
      cur.setMonth(cur.getMonth() + 1);
    }
    return labels;
  }
  if (bucket === "day") {
    const cur = new Date(from);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    while (cur <= end) {
      labels.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    const cur = new Date(from);
    const startOfWeek = new Date(cur);
    startOfWeek.setDate(cur.getDate() - cur.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const end = new Date(to);
    while (startOfWeek <= end) {
      labels.push(startOfWeek.toISOString().slice(0, 10));
      startOfWeek.setDate(startOfWeek.getDate() + 7);
    }
  }
  return labels;
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
    const fromStr = searchParams.get("from");
    const toParam = searchParams.get("to");
    const bucket = (searchParams.get("bucket") ?? "day") as "day" | "week" | "month";
    const roleParam = searchParams.get("role") as OrgRole | null;

    if (!fromStr || !toParam) {
      return NextResponse.json({ error: "from and to (YYYY-MM-DD) required" }, { status: 400 });
    }

    const from = new Date(fromStr + "T00:00:00Z");
    const to = new Date(toParam + "T23:59:59Z");
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (days > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Range must not exceed ${MAX_RANGE_DAYS} days` }, { status: 400 });
    }

    const membership = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = roleParam ?? membership.role;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, currency: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }

    const months = getMonthsInRange(from, to);

    let totalBudgetMinor = BigInt(0);
    for (const { year, month } of months) {
      const budgets = await prisma.monthlyBudget.findMany({
        where: { orgId, year, month },
      });
      totalBudgetMinor += budgets.reduce((acc, b) => acc + b.amountMinor, BigInt(0));
    }

    const approvedRequests = await prisma.expenseRequest.findMany({
      where: {
        orgId,
        status: { in: [RequestStatus.APPROVED, RequestStatus.PAID] },
        OR: [
          { submittedAt: { gte: from, lte: to } },
          { submittedAt: null, createdAt: { gte: from, lte: to } },
        ],
      },
      select: { amountMinor: true, submittedAt: true, createdAt: true, paidAt: true },
    });
    const approvedSpendMinor = approvedRequests.reduce((acc, r) => acc + r.amountMinor, BigInt(0));

    const paidRequests = await prisma.expenseRequest.findMany({
      where: {
        orgId,
        status: RequestStatus.PAID,
        paidAt: { gte: from, lte: to },
      },
      select: { amountMinor: true },
    });
    const paidSpendMinor = paidRequests.reduce((acc, r) => acc + r.amountMinor, BigInt(0));

    let remainingMinor = totalBudgetMinor - approvedSpendMinor;
    if (remainingMinor < BigInt(0)) remainingMinor = BigInt(0);

    const thirtyDaysAgo = new Date(to);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const paidLast30 = await prisma.expenseRequest.aggregate({
      where: {
        orgId,
        status: RequestStatus.PAID,
        paidAt: { gte: thirtyDaysAgo, lte: to },
      },
      _sum: { amountMinor: true },
    });
    const burnRate30Minor = paidLast30._sum.amountMinor ?? BigInt(0);
    const burnRatePerDay = (paidLast30._sum.amountMinor ?? BigInt(0)) / BigInt(30);
    const runwayDays = burnRatePerDay > BigInt(0) ? Number(remainingMinor / burnRatePerDay) : 999;

    const budgetUsedPct = totalBudgetMinor > BigInt(0)
      ? Math.min(100, Number((approvedSpendMinor * BigInt(10000) / totalBudgetMinor)) / 100)
      : 0;

    const allRangeRequests = await prisma.expenseRequest.findMany({
      where: {
        orgId,
        OR: [
          { submittedAt: { gte: from, lte: to } },
          { submittedAt: null, createdAt: { gte: from, lte: to } },
        ],
      },
      select: { status: true, submittedAt: true, createdAt: true },
    });
    const draftCount = allRangeRequests.filter((r) => r.status === RequestStatus.DRAFT).length;
    const pendingCount = allRangeRequests.filter((r) => r.status === RequestStatus.PENDING).length;
    const approvedCount = allRangeRequests.filter((r) => r.status === RequestStatus.APPROVED).length;
    const rejectedCount = allRangeRequests.filter((r) => r.status === RequestStatus.REJECTED).length;
    const paidCount = allRangeRequests.filter((r) => r.status === RequestStatus.PAID).length;

    let pendingApprovalsCount = 0;
    let overdueApprovalsCount = 0;
    const OVERDUE_DAYS = 5;
    const overdueCutoff = new Date();
    overdueCutoff.setDate(overdueCutoff.getDate() - OVERDUE_DAYS);

    if (role === "ADMIN" || role === "APPROVER") {
      const pendingReqs = await prisma.expenseRequest.findMany({
        where: { orgId, status: RequestStatus.PENDING, requesterUserId: { not: user.id } },
        select: { id: true, submittedAt: true },
      });
      const ids = pendingReqs.map((r) => r.id);
      const acted = ids.length
        ? await prisma.approvalAction.count({
            where: { requestId: { in: ids }, actorUserId: user.id },
          })
        : 0;
      pendingApprovalsCount = ids.length - acted;
      overdueApprovalsCount = pendingReqs.filter((r) => r.submittedAt && r.submittedAt < overdueCutoff).length;
    }

    const deptBudgets = await prisma.monthlyBudget.findMany({
      where: { orgId, year: { in: months.map((m) => m.year) }, month: { in: months.map((m) => m.month) } },
      include: { department: { select: { id: true, name: true } } },
    });
    const deptBudgetMap = new Map<string, bigint>();
    for (const b of deptBudgets) {
      const key = b.departmentId;
      deptBudgetMap.set(key, (deptBudgetMap.get(key) ?? BigInt(0)) + b.amountMinor);
    }

    const deptApproved = await prisma.expenseRequest.groupBy({
      by: ["departmentId"],
      where: {
        orgId,
        status: { in: [RequestStatus.APPROVED, RequestStatus.PAID] },
        OR: [
          { submittedAt: { gte: from, lte: to } },
          { submittedAt: null, createdAt: { gte: from, lte: to } },
        ],
      },
      _sum: { amountMinor: true },
    });
    const deptPaid = await prisma.expenseRequest.groupBy({
      by: ["departmentId"],
      where: {
        orgId,
        status: RequestStatus.PAID,
        paidAt: { gte: from, lte: to },
      },
      _sum: { amountMinor: true },
    });

    const deptIds = [...new Set([...deptBudgetMap.keys(), ...deptApproved.map((d) => d.departmentId)])];
    const departments = await prisma.department.findMany({
      where: { id: { in: deptIds } },
      select: { id: true, name: true },
    });
    const deptNameMap = Object.fromEntries(departments.map((d) => [d.id, d.name]));

    const departmentsTable = deptIds.map((departmentId) => {
      const budget = deptBudgetMap.get(departmentId) ?? BigInt(0);
      const approved = deptApproved.find((d) => d.departmentId === departmentId)?._sum.amountMinor ?? BigInt(0);
      const paid = deptPaid.find((d) => d.departmentId === departmentId)?._sum.amountMinor ?? BigInt(0);
      let rem = budget - approved;
      if (rem < BigInt(0)) rem = BigInt(0);
      return {
        departmentId,
        departmentName: deptNameMap[departmentId] ?? departmentId,
        budgetMinor: toStr(budget),
        approvedSpendMinor: toStr(approved),
        paidSpendMinor: toStr(paid),
        remainingMinor: toStr(rem),
      };
    });

    const labels = getBucketLabels(from, to, bucket);

    const spendSeriesData = await Promise.all(
      labels.map(async (bucketLabel) => {
        let bucketStart: Date;
        let bucketEnd: Date;
        if (bucket === "month") {
          const [y, m] = bucketLabel.split("-").map(Number);
          bucketStart = new Date(y, m - 1, 1);
          bucketEnd = new Date(y, m, 0, 23, 59, 59);
        } else {
          bucketStart = new Date(bucketLabel + "T00:00:00Z");
          if (bucket === "day") {
            bucketEnd = new Date(bucketLabel + "T23:59:59Z");
          } else {
            bucketEnd = new Date(bucketStart);
            bucketEnd.setDate(bucketEnd.getDate() + 6);
            bucketEnd.setHours(23, 59, 59, 999);
          }
        }

        const [approvedAgg, paidAgg] = await Promise.all([
          prisma.expenseRequest.aggregate({
            where: {
              orgId,
              status: { in: [RequestStatus.APPROVED, RequestStatus.PAID] },
              OR: [
                { submittedAt: { gte: bucketStart, lte: bucketEnd } },
                { submittedAt: null, createdAt: { gte: bucketStart, lte: bucketEnd } },
              ],
            },
            _sum: { amountMinor: true },
          }),
          prisma.expenseRequest.aggregate({
            where: {
              orgId,
              status: RequestStatus.PAID,
              paidAt: { gte: bucketStart, lte: bucketEnd },
            },
            _sum: { amountMinor: true },
          }),
        ]);

        return {
          bucketLabel,
          approvedSpendMinor: toStr(approvedAgg._sum.amountMinor ?? BigInt(0)),
          paidSpendMinor: toStr(paidAgg._sum.amountMinor ?? BigInt(0)),
        };
      })
    );

    const requestSeriesData = await Promise.all(
      labels.map(async (bucketLabel) => {
        let bucketStart: Date;
        let bucketEnd: Date;
        if (bucket === "month") {
          const [y, m] = bucketLabel.split("-").map(Number);
          bucketStart = new Date(y, m - 1, 1);
          bucketEnd = new Date(y, m, 0, 23, 59, 59);
        } else {
          bucketStart = new Date(bucketLabel + "T00:00:00Z");
          if (bucket === "day") {
            bucketEnd = new Date(bucketLabel + "T23:59:59Z");
          } else {
            bucketEnd = new Date(bucketStart);
            bucketEnd.setDate(bucketEnd.getDate() + 6);
            bucketEnd.setHours(23, 59, 59, 999);
          }
        }

        const reqs = await prisma.expenseRequest.findMany({
          where: {
            orgId,
            OR: [
              { submittedAt: { gte: bucketStart, lte: bucketEnd } },
              { submittedAt: null, createdAt: { gte: bucketStart, lte: bucketEnd } },
            ],
          },
          select: { status: true },
        });

        return {
          bucketLabel,
          submittedCount: reqs.length,
          approvedCount: reqs.filter((r) => r.status === RequestStatus.APPROVED || r.status === RequestStatus.PAID).length,
          rejectedCount: reqs.filter((r) => r.status === RequestStatus.REJECTED).length,
          paidCount: reqs.filter((r) => r.status === RequestStatus.PAID).length,
        };
      })
    );

    const deptSpendSeries = departmentsTable;

    let countsToUse = {
      draftCount,
      pendingCount,
      approvedCount,
      rejectedCount,
      paidCount,
      pendingApprovalsCount: role === "ADMIN" || role === "APPROVER" ? pendingApprovalsCount : 0,
    };

    if (role === "STAFF") {
      const myByRequester = await prisma.expenseRequest.findMany({
        where: {
          orgId,
          requesterUserId: user.id,
          OR: [
            { submittedAt: { gte: from, lte: to } },
            { submittedAt: null, createdAt: { gte: from, lte: to } },
          ],
        },
        select: { status: true },
      });
      countsToUse = {
        draftCount: myByRequester.filter((r) => r.status === RequestStatus.DRAFT).length,
        pendingCount: myByRequester.filter((r) => r.status === RequestStatus.PENDING).length,
        approvedCount: myByRequester.filter((r) => r.status === RequestStatus.APPROVED).length,
        rejectedCount: myByRequester.filter((r) => r.status === RequestStatus.REJECTED).length,
        paidCount: myByRequester.filter((r) => r.status === RequestStatus.PAID).length,
        pendingApprovalsCount: 0,
      };
    }

    const base: Record<string, unknown> = {
      org: { id: org.id, name: org.name, currency: org.currency ?? "USD" },
      range: { from: fromStr, to: toParam, bucket },
      kpis: {
        totalBudgetMinor: toStr(totalBudgetMinor),
        approvedSpendMinor: toStr(approvedSpendMinor),
        paidSpendMinor: toStr(paidSpendMinor),
        remainingMinor: toStr(remainingMinor),
        burnRateMinor: toStr(burnRate30Minor),
        budgetUsedPct,
        runwayDays,
        pendingApprovalsCount: role === "ADMIN" || role === "APPROVER" ? pendingApprovalsCount : 0,
        overdueApprovalsCount: role === "ADMIN" || role === "APPROVER" ? overdueApprovalsCount : 0,
      },
      counts: countsToUse,
      departmentsTable,
      spendSeries: spendSeriesData,
      requestSeries: requestSeriesData,
      deptSpendSeries,
    };

    if (role === "ADMIN") {
      const spendPolicy = await prisma.orgSpendPolicy.findUnique({ where: { orgId } });
      const requireReceipt = spendPolicy?.requireReceiptForPayment ?? POLICY_DEFAULTS.requireReceiptForPayment;
      const receiptThreshold = spendPolicy?.receiptRequiredAboveMinor ?? POLICY_DEFAULTS.receiptRequiredAboveMinor;
      const blockOverBudget = spendPolicy?.blockOverBudget ?? POLICY_DEFAULTS.blockOverBudget;

      const approvedToPay = await prisma.expenseRequest.findMany({
        where: { orgId, status: RequestStatus.APPROVED },
        include: {
          vendor: true,
          receiptFiles: { select: { id: true } },
          approvalActions: { where: { decision: "APPROVE" }, select: { id: true } },
        },
        orderBy: { submittedAt: "desc" },
        take: 25,
      });

      const paymentsReady: Array<{ id: string; title: string; amountMinor: string; departmentName: string; vendorName: string }> = [];
      const policyBlocked: Array<{ id: string; title: string; amountMinor: string; blockReason: string }> = [];

      for (const req of approvedToPay) {
        const approvalsReceived = req.approvalActions.length;
        if (approvalsReceived < req.requiredApprovals) continue;

        let blockReason: string | null = null;
        if (req.vendor.status !== "ACTIVE") blockReason = "VENDOR_INACTIVE";
        else if (!req.vendor.ownerPubkey) blockReason = "VENDOR_WALLET_NOT_SET";
        else if (requireReceipt && req.amountMinor >= receiptThreshold && req.receiptFiles.length < 1) {
          blockReason = "RECEIPT_REQUIRED";
        } else if (blockOverBudget) {
          const refDate = req.submittedAt ?? req.createdAt;
          const year = refDate.getFullYear();
          const month = refDate.getMonth() + 1;
          const budget = await prisma.monthlyBudget.findUnique({
            where: { departmentId_year_month: { departmentId: req.departmentId, year, month } },
          });
          const budgetMinor = budget?.amountMinor ?? BigInt(0);
          const spent = await prisma.expenseRequest.aggregate({
            where: {
              departmentId: req.departmentId,
              orgId,
              status: { in: [RequestStatus.APPROVED, RequestStatus.PAID] },
              OR: [
                { submittedAt: { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0) } },
                { submittedAt: null, createdAt: { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0) } },
              ],
            },
            _sum: { amountMinor: true },
          });
          const remaining = budgetMinor - (spent._sum.amountMinor ?? BigInt(0));
          if (remaining < req.amountMinor) blockReason = "OVER_BUDGET";
        }

        const dept = departments.find((d) => d.id === req.departmentId);
        if (blockReason) {
          policyBlocked.push({
            id: req.id,
            title: req.title,
            amountMinor: toStr(req.amountMinor),
            blockReason,
          });
        } else {
          paymentsReady.push({
            id: req.id,
            title: req.title,
            amountMinor: toStr(req.amountMinor),
            departmentName: dept?.name ?? "",
            vendorName: req.vendor.name,
          });
        }
      }

      (base as Record<string, unknown>).queues = {
        paymentsReady: paymentsReady.slice(0, 10),
        policyBlocked: policyBlocked.slice(0, 10),
      };

      (base.kpis as Record<string, unknown>).blockedPaymentsCount = policyBlocked.length;

      const attentionAlerts: Array<{ severity: "high" | "medium" | "low"; message: string; href: string }> = [];
      departmentsTable.forEach((d) => {
        const budget = BigInt(d.budgetMinor);
        const approved = BigInt(d.approvedSpendMinor);
        if (budget > BigInt(0)) {
          const pct = Number((approved * BigInt(100) / budget));
          if (pct >= 80) {
            attentionAlerts.push({
              severity: pct >= 90 ? "high" : "medium",
              message: `${d.departmentName} at ${pct}% budget used`,
              href: `/app/requests?department=${d.departmentId}`,
            });
          }
        }
      });
      if (overdueApprovalsCount > 0) {
        attentionAlerts.push({
          severity: "high",
          message: `${overdueApprovalsCount} requests pending >${OVERDUE_DAYS} days`,
          href: "/app/requests?status=PENDING&mine=0",
        });
      }
      if (policyBlocked.length > 0) {
        attentionAlerts.push({
          severity: "medium",
          message: `${policyBlocked.length} payments blocked by policy`,
          href: "/app/payments",
        });
      }
      if (budgetUsedPct >= 90) {
        attentionAlerts.push({
          severity: "high",
          message: "Org budget >90% used",
          href: "/app/settings/budgets",
        });
      }
      const uncodedCount = await prisma.invoice.count({
        where: {
          orgId,
          status: { in: ["SUBMITTED", "NEEDS_VERIFICATION", "EXCEPTION"] },
          OR: [{ departmentId: null }, { glCode: null }],
        },
      });
      if (uncodedCount > 0) {
        attentionAlerts.push({
          severity: "medium",
          message: `${uncodedCount} invoice(s) need coding before verify`,
          href: "/app/invoices",
        });
      }
      const matchExceptionsCount = await prisma.invoice.count({
        where: { orgId, status: "EXCEPTION" },
      });
      if (matchExceptionsCount > 0) {
        attentionAlerts.push({
          severity: "high",
          message: `${matchExceptionsCount} invoice match exception(s) need resolution`,
          href: "/app/invoices?status=EXCEPTION",
        });
      }
      const overdueCutoff = new Date();
      overdueCutoff.setDate(overdueCutoff.getDate() - 5);
      const overdueVerificationCount = await prisma.invoice.count({
        where: {
          orgId,
          status: { in: ["SUBMITTED", "NEEDS_VERIFICATION", "EXCEPTION"] },
          submittedAt: { lte: overdueCutoff },
        },
      });
      if (overdueVerificationCount > 0) {
        attentionAlerts.push({
          severity: "high",
          message: `${overdueVerificationCount} invoice(s) overdue verification (>5 days)`,
          href: "/app/invoices?overdueVerification=true",
        });
      }
      const noReceiptPoInvoices = await prisma.invoice.count({
        where: {
          orgId,
          type: "PO_INVOICE",
          status: { in: ["SUBMITTED", "EXCEPTION"] },
          matchResults: { some: { status: "NO_RECEIPT" } },
        },
      });
      if (noReceiptPoInvoices > 0) {
        attentionAlerts.push({
          severity: "medium",
          message: `${noReceiptPoInvoices} PO invoice(s) have no goods receipt`,
          href: "/app/invoices?noReceipt=true",
        });
      }
      const policy = await prisma.orgPolicy.findUnique({ where: { orgId } });
      const highThreshold = policy?.highValueThresholdMinor ?? BigInt(1000000);
      const highValueExceptions = await prisma.invoice.count({
        where: {
          orgId,
          status: "EXCEPTION",
          totalMinor: { gte: highThreshold },
        },
      });
      if (highValueExceptions > 0) {
        attentionAlerts.push({
          severity: "high",
          message: `${highValueExceptions} high-value exception(s) need resolution`,
          href: "/app/invoices?status=EXCEPTION&highValue=true",
        });
      }
      const { getVendorConcentrationAlerts, getOnboardingOverdueCount, getUnverifiedPaymentMethodCount } =
        await import("@/lib/vendor-queries");
      const vendorConcentration = await getVendorConcentrationAlerts(orgId, from, to, 25);
      for (const v of vendorConcentration) {
        attentionAlerts.push({
          severity: "medium",
          message: `Vendor concentration: ${v.vendorName} is ${v.concentrationPct.toFixed(1)}% of spend`,
          href: "/app/vendors",
        });
      }
      const onboardingOverdue = await getOnboardingOverdueCount(orgId);
      if (onboardingOverdue > 0) {
        attentionAlerts.push({
          severity: "high",
          message: `${onboardingOverdue} vendor(s) onboarding overdue (>7 days)`,
          href: "/app/vendors?status=ONBOARDING&overdue=true",
        });
      }
      const unverifiedPmCount = await getUnverifiedPaymentMethodCount(orgId);
      if (unverifiedPmCount > 0) {
        attentionAlerts.push({
          severity: "medium",
          message: `${unverifiedPmCount} vendor(s) with unverified payment method`,
          href: "/app/vendors?paymentUnverified=true",
        });
      }
      (base as Record<string, unknown>).attentionAlerts = attentionAlerts.slice(0, 12);
    }

    if (role === "APPROVER") {
      const pendingForApprover = await prisma.expenseRequest.findMany({
        where: {
          orgId,
          status: RequestStatus.PENDING,
          requesterUserId: { not: user.id },
          NOT: { approvalActions: { some: { actorUserId: user.id } } },
        },
        include: { department: { select: { name: true } }, vendor: { select: { name: true } } },
        orderBy: { submittedAt: "desc" },
        take: 10,
      });
      (base as Record<string, unknown>).queues = {
        pendingApprovals: pendingForApprover.map((r) => ({
          id: r.id,
          title: r.title,
          amountMinor: toStr(r.amountMinor),
          departmentName: r.department.name,
          vendorName: r.vendor.name,
        })),
      };
    }

    if (role === "STAFF") {
      const myDrafts = await prisma.expenseRequest.findMany({
        where: { orgId, requesterUserId: user.id, status: RequestStatus.DRAFT },
        orderBy: { updatedAt: "desc" },
        take: 5,
      });
      const myPending = await prisma.expenseRequest.findMany({
        where: { orgId, requesterUserId: user.id, status: RequestStatus.PENDING },
        orderBy: { submittedAt: "desc" },
        take: 5,
      });

      const spendPolicy = await prisma.orgSpendPolicy.findUnique({ where: { orgId } });
      const requireReceipt = spendPolicy?.requireReceiptForPayment ?? POLICY_DEFAULTS.requireReceiptForPayment;
      const receiptThreshold = spendPolicy?.receiptRequiredAboveMinor ?? POLICY_DEFAULTS.receiptRequiredAboveMinor;

      const myApproved = await prisma.expenseRequest.findMany({
        where: { orgId, requesterUserId: user.id, status: RequestStatus.APPROVED },
        orderBy: { submittedAt: "desc" },
        take: 10,
      });

      const actionNeeded: Array<{ id: string; title: string; reason: string }> = [];
      for (const r of [...myDrafts, ...myPending, ...myApproved]) {
        if (requireReceipt && r.amountMinor >= receiptThreshold) {
          const count = await prisma.receiptFile.count({ where: { requestId: r.id } });
          if (count < 1) actionNeeded.push({ id: r.id, title: r.title, reason: "Receipt missing" });
        }
      }

      (base as Record<string, unknown>).queues = {
        myDrafts: myDrafts.map((r) => ({ id: r.id, title: r.title, amountMinor: toStr(r.amountMinor) })),
        myPending: myPending.map((r) => ({ id: r.id, title: r.title, amountMinor: toStr(r.amountMinor) })),
        actionNeeded: actionNeeded.slice(0, 5),
      };
    }

    if (role === "AUDITOR") {
      const verificationByBucket = await Promise.all(
        labels.map(async (bucketLabel) => {
          const bucketStart = new Date(bucketLabel + "T00:00:00Z");
          let bucketEnd: Date;
          if (bucket === "day") {
            bucketEnd = new Date(bucketLabel + "T23:59:59Z");
          } else {
            bucketEnd = new Date(bucketStart);
            bucketEnd.setDate(bucketEnd.getDate() + 6);
            bucketEnd.setHours(23, 59, 59, 999);
          }

          const recons = await prisma.paymentReconciliation.findMany({
            where: {
              orgId,
              checkedAt: { gte: bucketStart, lte: bucketEnd },
            },
            select: { status: true },
          });

          return {
            bucketLabel,
            verifiedCount: recons.filter((r) => r.status === "VERIFIED").length,
            warningCount: recons.filter((r) => r.status === "WARNING").length,
            failedCount: recons.filter((r) => r.status === "FAILED").length,
            notCheckedCount: recons.filter((r) => r.status === "PENDING").length,
          };
        })
      );
      (base as Record<string, unknown>).verificationSeries = verificationByBucket;
    }

    return jsonResponse(base);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
