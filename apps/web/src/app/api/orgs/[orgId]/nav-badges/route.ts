import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { jsonResponse } from "@/lib/json-response";
import { OrgRole, RequestStatus } from "@prisma/client";
import { getPermsForRole } from "@/lib/chat-permissions";

const OVERDUE_VERIFICATION_DAYS = 5;

const POLICY_DEFAULTS = {
  requireReceiptForPayment: true,
  receiptRequiredAboveMinor: BigInt(0),
  blockOverBudget: true,
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const membership = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membership.role;

    const result: {
      pendingApprovals: number;
      overdueApprovals: number;
      paymentsReady: number;
      blockedPayments: number;
      invoiceExceptions: number;
      invoicesOverdueVerification: number;
      chatUnread: number;
    } = {
      pendingApprovals: 0,
      overdueApprovals: 0,
      paymentsReady: 0,
      blockedPayments: 0,
      invoiceExceptions: 0,
      invoicesOverdueVerification: 0,
      chatUnread: 0,
    };

    // Chat unread (all org members)
    const chatChannels = await prisma.chatChannel.findMany({
      where: { orgId, isArchived: false },
      include: { permissions: true },
    });
    const visibleChannels = chatChannels.filter((ch) => {
      const perms = getPermsForRole(ch.permissions, role);
      return perms.canView;
    });
    const channelIds = visibleChannels.map((c) => c.id);
    const readStates = await prisma.chatChannelReadState.findMany({
      where: { orgId, channelId: { in: channelIds }, userId: user.id },
    });
    const readByChannel = new Map(readStates.map((r) => [r.channelId, r]));
    for (const ch of visibleChannels) {
      const readState = readByChannel.get(ch.id);
      const cutoff = readState?.lastReadMessageCreatedAt ?? null;
      const count = await prisma.chatMessage.count({
        where: {
          channelId: ch.id,
          orgId,
          deletedAt: null,
          senderUserId: { not: user.id },
          ...(cutoff ? { createdAt: { gt: cutoff } } : {}),
        },
      });
      result.chatUnread += count;
    }

    if (role === "ADMIN" || role === "APPROVER") {
      const overdueCutoff = new Date();
      overdueCutoff.setDate(overdueCutoff.getDate() - OVERDUE_VERIFICATION_DAYS);
      result.invoiceExceptions = await prisma.invoice.count({
        where: { orgId, status: "EXCEPTION" },
      });
      result.invoicesOverdueVerification = await prisma.invoice.count({
        where: {
          orgId,
          status: { in: ["SUBMITTED", "NEEDS_VERIFICATION", "EXCEPTION"] },
          submittedAt: { lte: overdueCutoff },
        },
      });
    }

    if (role === "ADMIN" || role === "APPROVER") {
      const pending = await prisma.expenseRequest.findMany({
        where: {
          orgId,
          status: RequestStatus.PENDING,
          requesterUserId: { not: user.id },
        },
        select: {
          id: true,
          submittedAt: true,
          approvalActions: { where: { actorUserId: user.id }, select: { id: true } },
        },
      });
      const pendingForMe = pending.filter((r) => r.approvalActions.length === 0);
      result.pendingApprovals = pendingForMe.length;
      const overdueDays = 5;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - overdueDays);
      result.overdueApprovals = pendingForMe.filter(
        (r) => r.submittedAt && r.submittedAt < cutoff
      ).length;
    }

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
      });

      for (const req of approvedToPay) {
        if (req.approvalActions.length < req.requiredApprovals) continue;

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

        if (blockReason) result.blockedPayments++;
        else result.paymentsReady++;
      }
    }

    return jsonResponse(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
