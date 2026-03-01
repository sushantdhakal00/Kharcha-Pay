import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/db";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import Link from "next/link";
import { RequestDetailClient } from "./request-detail-client";
import { bigIntToString } from "@/lib/bigint";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { id: requestId } = await params;

  const req = await prisma.expenseRequest.findUnique({
    where: { id: requestId },
    include: {
      department: { select: { name: true } },
      vendor: { select: { name: true, ownerPubkey: true } },
      requester: { select: { username: true } },
      approvalActions: { include: { actor: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
      receiptFiles: true,
      paymentReconciliation: true,
      org: { include: { chainConfig: { select: { cluster: true, token2022Mint: true, tokenProgramId: true } } } },
    },
  });
  if (!req) notFound();

  try {
    await requireOrgReadAccess(req.orgId, user.id);
  } catch {
    notFound();
  }

  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: req.orgId, userId: user.id } },
  });
  const role = membership?.role ?? null;
  const isAuditor = role === "AUDITOR";
  const isRequester = req.requesterUserId === user.id;
  const canEdit = !isAuditor && isRequester && req.status === "DRAFT";
  const canSubmit = !isAuditor && isRequester && req.status === "DRAFT";
  const canDecide =
    !isAuditor && (role === "ADMIN" || role === "APPROVER") && req.status === "PENDING" && !isRequester;
  const canPay = !isAuditor && role === "ADMIN" && req.status === "APPROVED";
  const canVerify = !isAuditor && role === "ADMIN" && req.status === "PAID";

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  let budgetRemaining: { remaining: string } | null = null;
  let budgetRemainingRequestMonth: string | null = null;
  const refDate = req.submittedAt ?? req.createdAt;
  const requestYear = refDate.getFullYear();
  const requestMonth = refDate.getMonth() + 1;
  if (req.departmentId) {
    const budget = await prisma.monthlyBudget.findUnique({
      where: { departmentId_year_month: { departmentId: req.departmentId, year: currentYear, month: currentMonth } },
    });
    const budgetMinor = budget?.amountMinor ?? BigInt(0);
    const spentResult = await prisma.expenseRequest.aggregate({
      where: {
        departmentId: req.departmentId,
        orgId: req.orgId,
        status: "APPROVED",
        submittedAt: {
          gte: new Date(currentYear, currentMonth - 1, 1),
          lt: new Date(currentYear, currentMonth, 1),
        },
      },
      _sum: { amountMinor: true },
    });
    const spent = spentResult._sum.amountMinor ?? BigInt(0);
    const remaining = budgetMinor - spent;
    budgetRemaining = { remaining: bigIntToString(remaining < 0 ? BigInt(0) : remaining) };

    const budgetRequestMonth = await prisma.monthlyBudget.findUnique({
      where: { departmentId_year_month: { departmentId: req.departmentId, year: requestYear, month: requestMonth } },
    });
    const budgetMinorReq = budgetRequestMonth?.amountMinor ?? BigInt(0);
    const startReq = new Date(requestYear, requestMonth - 1, 1);
    const endReq = new Date(requestYear, requestMonth, 0, 23, 59, 59);
    const spentReq = await prisma.expenseRequest.aggregate({
      where: {
        departmentId: req.departmentId,
        orgId: req.orgId,
        status: { in: ["APPROVED", "PAID"] },
        OR: [
          { submittedAt: { gte: startReq, lte: endReq } },
          { submittedAt: null, createdAt: { gte: startReq, lte: endReq } },
        ],
      },
      _sum: { amountMinor: true },
    });
    let remReq = budgetMinorReq - (spentReq._sum.amountMinor ?? BigInt(0));
    if (remReq < BigInt(0)) remReq = BigInt(0);
    budgetRemainingRequestMonth = bigIntToString(remReq);
  }

  const spendPolicy = await prisma.orgSpendPolicy.findUnique({
    where: { orgId: req.orgId },
  });
  const requireReceipt = spendPolicy?.requireReceiptForPayment ?? true;
  const receiptThreshold = spendPolicy?.receiptRequiredAboveMinor ?? BigInt(0);
  const blockOverBudget = spendPolicy?.blockOverBudget ?? true;
  const allowAdminOverride = spendPolicy?.allowAdminOverrideOverBudget ?? false;
  const receiptRequired = requireReceipt && req.amountMinor >= receiptThreshold;
  const receiptAttached = req.receiptFiles.length >= 1;
  const remainingNum = budgetRemainingRequestMonth != null ? Number(budgetRemainingRequestMonth) : null;
  const exceedsBudget = remainingNum != null && Number(req.amountMinor) > remainingNum;
  const withinBudget = !blockOverBudget || !exceedsBudget;

  const approvalsReceived = req.approvalActions.filter((a) => a.decision === "APPROVE").length;
  const requestJson = {
    id: req.id,
    orgId: req.orgId,
    departmentId: req.departmentId,
    vendorId: req.vendorId,
    requesterUserId: req.requesterUserId,
    title: req.title,
    purpose: req.purpose,
    category: req.category,
    amountMinor: bigIntToString(req.amountMinor),
    currency: req.currency,
    status: req.status,
    requiredApprovals: req.requiredApprovals,
    approvalsReceived,
    submittedAt: req.submittedAt?.toISOString() ?? null,
    decidedAt: req.decidedAt?.toISOString() ?? null,
    createdAt: req.createdAt.toISOString(),
    departmentName: req.department.name,
    vendorName: req.vendor.name,
    requesterUsername: req.requester.username,
    approvalActions: req.approvalActions.map((a) => ({
      id: a.id,
      actorUserId: a.actorUserId,
      actorUsername: a.actor?.username,
      decision: a.decision,
      note: a.note,
      createdAt: a.createdAt.toISOString(),
    })),
    receiptFiles: req.receiptFiles.map((r) => ({
      id: r.id,
      downloadUrl: `/api/receipts/${r.id}`,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
    })),
    paidAt: req.paidAt?.toISOString() ?? null,
    paidTxSig: req.paidTxSig ?? null,
    paidToTokenAccount: req.paidToTokenAccount ?? null,
    cluster: req.org?.chainConfig?.cluster ?? "devnet",
    chainMint: req.org?.chainConfig?.token2022Mint ?? null,
    chainTokenProgramId: req.org?.chainConfig?.tokenProgramId ?? null,
    verificationStatus: req.paymentReconciliation?.status ?? "PENDING",
    verificationCheckedAt: req.paymentReconciliation?.checkedAt?.toISOString() ?? null,
    verificationReasons: (req.paymentReconciliation?.detailsJson as { reasons?: string[] } | null)?.reasons ?? [],
    verificationDetails: (req.paymentReconciliation?.detailsJson as {
      reasons?: string[];
      observed?: { memo?: string; amountMinor?: string; source?: string; destination?: string; mint?: string; tokenProgram?: string };
      expected?: { memo: string; amountMinor: string; source: string; destination: string; mint: string; tokenProgram: string };
    } | null) ?? null,
  };

  const paymentReadiness = {
    approved: req.status === "APPROVED",
    receiptRequired,
    receiptAttached,
    withinBudget,
    budgetRemainingRequestMonth,
    vendorWalletSet: !!req.vendor.ownerPubkey,
    blockOverBudget,
    allowAdminOverride,
    exceedsBudget,
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
        <Link href="/app/requests" className="hover:underline">Requests</Link>
        <span>/</span>
        <span className="text-slate-900">{req.title}</span>
      </div>
      <RequestDetailClient
        request={requestJson}
        budgetRemaining={budgetRemaining?.remaining ?? null}
        paymentReadiness={paymentReadiness}
        canEdit={canEdit}
        canSubmit={canSubmit}
        canDecide={canDecide}
        canPay={canPay}
        canVerify={canVerify}
        isDemo={req.org?.isDemo ?? false}
        orgSlug={req.org?.slug ?? ""}
      />
    </div>
  );
}
