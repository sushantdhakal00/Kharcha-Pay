import { NextResponse } from "next/server";
import { requestPaySchema } from "@kharchapay/shared";
import { PaymentVerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { requireRecentAuth, REAUTH_MAX_AGE_SECONDS } from "@/lib/require-recent-auth";
import { OrgRole, RequestStatus } from "@prisma/client";
import { env } from "@/lib/env";
import { getConnection, getTreasuryKeypair, RpcNotConfiguredError } from "@/lib/solana/connection";
import { logAuditEvent } from "@/lib/audit";
import { emitOutboxEvent } from "@/lib/outbox";
import { createNotification } from "@/lib/notifications";
import {
  getOrCreateVendorAta,
  transferWithMemo,
  buildRequestMemo,
} from "@/lib/solana/payments";
import { DEMO_PAID_TX_SIG } from "@/lib/demo-seed";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { bigIntToString } from "@/lib/bigint";
import { opsLog } from "@/lib/ops-log";
import { safeApiError } from "@/lib/safe-api-error";

const POLICY_DEFAULTS = {
  requireReceiptForPayment: true,
  receiptRequiredAboveMinor: BigInt(0),
  blockOverBudget: true,
  allowAdminOverrideOverBudget: false,
};

/**
 * POST /api/orgs/[orgId]/requests/[requestId]/pay
 * ADMIN only. Pay an APPROVED request (Token-2022 transfer with Required Memo).
 * Enforces: receipt (if policy), budget, vendor wallet. overrideNote when over budget + override allowed.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string; requestId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    await requireRecentAuth(REAUTH_MAX_AGE_SECONDS);
    const { orgId, requestId } = await params;
    await requireOrgWriteAccess(orgId, user.id);
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await request.json().catch(() => ({}));
    const parsed = requestPaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const overrideNote = parsed.data?.overrideNote;

    const expenseRequest = await prisma.expenseRequest.findFirst({
      where: { id: requestId, orgId },
      include: {
        vendor: true,
        org: { select: { slug: true, isDemo: true } },
        receiptFiles: { select: { id: true } },
        approvalActions: { where: { decision: "APPROVE" }, select: { id: true } },
      },
    });
    if (!expenseRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const cluster = process.env.SOLANA_CLUSTER ?? "devnet";

    const isDemoOrg = expenseRequest.org?.isDemo || expenseRequest.org?.slug === "demo-org";
    const isInternalMode =
      process.env.NEXT_PUBLIC_INTERNAL_MODE === "1" || process.env.NEXT_PUBLIC_INTERNAL_MODE === "true";
    const isDemoMode = env.DEMO_MODE === "1" || env.DEMO_MODE === "true";
    const useDemoMockPay = isDemoOrg && isInternalMode && isDemoMode;

    if (expenseRequest.status === RequestStatus.PAID) {
      const explorerLink = expenseRequest.paidTxSig
        ? `https://explorer.solana.com/tx/${expenseRequest.paidTxSig}?cluster=${cluster}`
        : null;
      return NextResponse.json({
        alreadyPaid: true,
        paidTxSig: expenseRequest.paidTxSig,
        paidAt: expenseRequest.paidAt?.toISOString() ?? null,
        explorerLink,
      });
    }

    if (expenseRequest.status !== RequestStatus.APPROVED) {
      opsLog.payFailure(requestId, "NOT_APPROVED");
      return NextResponse.json(
        { error: "Only approved requests can be paid", code: "NOT_APPROVED" },
        { status: 400 }
      );
    }
    if (!expenseRequest.vendorId || expenseRequest.amountMinor <= BigInt(0)) {
      return NextResponse.json(
        { error: "Request must have a vendor and positive amount", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    if (useDemoMockPay) {
      const vendor = expenseRequest.vendor;
      if (vendor.status !== "ACTIVE" || !vendor.ownerPubkey) {
        return NextResponse.json(
          {
            error: "Demo: vendor must be ACTIVE with ownerPubkey set. Run Reset demo to reseed.",
            code: "VENDOR_WALLET_NOT_SET",
          },
          { status: 400 }
        );
      }
      const approvalsReceived = expenseRequest.approvalActions.length;
      if (approvalsReceived < expenseRequest.requiredApprovals) {
        return NextResponse.json(
          { error: "Insufficient approvals", code: "INSUFFICIENT_APPROVALS" },
          { status: 400 }
        );
      }

      const now = new Date();
      const memoMessage = buildRequestMemo(requestId, expenseRequest.org?.slug ?? undefined);
      const paidToTokenAccount = vendor.tokenAccount ?? "DEMO_TOKEN_ACCOUNT";

      await prisma.expenseRequest.update({
        where: { id: requestId },
        data: {
          status: RequestStatus.PAID,
          paidAt: now,
          paidTxSig: DEMO_PAID_TX_SIG,
          paidByUserId: user.id,
          paidToTokenAccount,
        },
      });

      const amountStr = expenseRequest.amountMinor.toString();
      const token2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
      const detailsJson = {
        reasons: [] as string[],
        observed: {
          memo: memoMessage,
          amountMinor: amountStr,
          source: "DemoTreasuryTokenAccount11111111111111111",
          destination: paidToTokenAccount,
          mint: "DemoMint11111111111111111111111111111111",
          tokenProgram: token2022,
        },
        expected: {
          memo: memoMessage,
          amountMinor: amountStr,
          source: "DemoTreasuryTokenAccount11111111111111111",
          destination: paidToTokenAccount,
          mint: "DemoMint11111111111111111111111111111111",
          tokenProgram: token2022,
        },
      };

      await prisma.paymentReconciliation.upsert({
        where: { requestId },
        create: {
          orgId,
          requestId,
          txSig: DEMO_PAID_TX_SIG,
          status: PaymentVerificationStatus.VERIFIED,
          checkedAt: now,
          detailsJson: detailsJson as object,
        },
        update: {
          status: PaymentVerificationStatus.VERIFIED,
          checkedAt: now,
          detailsJson: detailsJson as object,
        },
      });

      try {
        await emitOutboxEvent({
          orgId,
          type: "PAYMENT_PAID",
          payload: {
            requestId,
            vendorId: expenseRequest.vendorId!,
            amountMinor: expenseRequest.amountMinor.toString(),
            paidTxSig: DEMO_PAID_TX_SIG,
            paidAt: now.toISOString(),
            paidByUserId: user.id,
          },
        });
      } catch {
        /* ignore for demo */
      }
      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "REQUEST_PAID",
        entityType: "ExpenseRequest",
        entityId: requestId,
        before: {
          status: RequestStatus.APPROVED,
          amountMinor: expenseRequest.amountMinor.toString(),
          vendorId: expenseRequest.vendorId,
          departmentId: expenseRequest.departmentId,
        },
        after: {
          status: RequestStatus.PAID,
          amountMinor: expenseRequest.amountMinor.toString(),
          vendorId: expenseRequest.vendorId,
          departmentId: expenseRequest.departmentId,
          paidAt: now.toISOString(),
          paidTxSig: DEMO_PAID_TX_SIG,
          paidToTokenAccount,
        },
        metadata: { paidTxSig: DEMO_PAID_TX_SIG, memo: memoMessage, demoMockPay: true },
      });
      try {
        await createNotification({
          orgId,
          userId: expenseRequest.requesterUserId,
          type: "REQUEST_PAID",
          title: "Request paid",
          body: `Your request "${expenseRequest.title}" has been paid.`,
          link: `/app/requests/${requestId}`,
        });
      } catch {
        /* ignore for demo */
      }
      opsLog.paySuccess(requestId);
      const explorerLink = `https://explorer.solana.com/tx/${DEMO_PAID_TX_SIG}?cluster=${cluster}`;
      return NextResponse.json({
        paidTxSig: DEMO_PAID_TX_SIG,
        paidAt: now.toISOString(),
        paidToTokenAccount,
        amountMinor: bigIntToString(expenseRequest.amountMinor),
        explorerLink,
      });
    }

    const approvalsReceived = expenseRequest.approvalActions.length;
    if (approvalsReceived < expenseRequest.requiredApprovals) {
      return NextResponse.json(
        { error: "Insufficient approvals", code: "INSUFFICIENT_APPROVALS" },
        { status: 400 }
      );
    }

    const spendPolicy = await prisma.orgSpendPolicy.findUnique({
      where: { orgId },
    });
    const requireReceipt = spendPolicy?.requireReceiptForPayment ?? POLICY_DEFAULTS.requireReceiptForPayment;
    const receiptThreshold = spendPolicy?.receiptRequiredAboveMinor ?? POLICY_DEFAULTS.receiptRequiredAboveMinor;
    const blockOverBudget = spendPolicy?.blockOverBudget ?? POLICY_DEFAULTS.blockOverBudget;
    const allowOverride = spendPolicy?.allowAdminOverrideOverBudget ?? POLICY_DEFAULTS.allowAdminOverrideOverBudget;

    if (requireReceipt && expenseRequest.amountMinor >= receiptThreshold) {
      const receiptCount = expenseRequest.receiptFiles.length;
      if (receiptCount < 1) {
        await logAuditEvent({
          orgId,
          actorUserId: user.id,
          action: "PAYMENT_BLOCKED",
          entityType: "ExpenseRequest",
          entityId: requestId,
          metadata: { code: "RECEIPT_REQUIRED" },
        });
        opsLog.payFailure(requestId, "RECEIPT_REQUIRED");
        return NextResponse.json(
          { error: "Receipt required before payment", code: "RECEIPT_REQUIRED" },
          { status: 400 }
        );
      }
    }

    const refDate = expenseRequest.submittedAt ?? expenseRequest.createdAt;
    const year = refDate.getFullYear();
    const month = refDate.getMonth() + 1;
    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const budget = await prisma.monthlyBudget.findUnique({
      where: { departmentId_year_month: { departmentId: expenseRequest.departmentId, year, month } },
    });
    const budgetMinor = budget?.amountMinor ?? BigInt(0);
    const approvedOrPaid = await prisma.expenseRequest.aggregate({
      where: {
        departmentId: expenseRequest.departmentId,
        orgId,
        status: { in: [RequestStatus.APPROVED, RequestStatus.PAID] },
        OR: [
          { submittedAt: { gte: startOfMonth, lte: endOfMonth } },
          { submittedAt: null, createdAt: { gte: startOfMonth, lte: endOfMonth } },
        ],
      },
      _sum: { amountMinor: true },
    });
    const spent = approvedOrPaid._sum.amountMinor ?? BigInt(0);
    let remainingMinor = budgetMinor - spent;
    if (remainingMinor < BigInt(0)) remainingMinor = BigInt(0);

    let overBudgetOverride = false;
    if (blockOverBudget && remainingMinor < expenseRequest.amountMinor) {
      if (allowOverride && overrideNote && overrideNote.trim().length >= 5) {
        overBudgetOverride = true;
      } else {
        await logAuditEvent({
          orgId,
          actorUserId: user.id,
          action: "PAYMENT_BLOCKED",
          entityType: "ExpenseRequest",
          entityId: requestId,
          metadata: { code: "OVER_BUDGET", remainingMinor: remainingMinor.toString() },
        });
        opsLog.payFailure(requestId, "OVER_BUDGET");
        return NextResponse.json(
          {
            error: "Payment would exceed remaining budget. Add an override note (min 5 chars) if admin override is allowed.",
            code: "OVER_BUDGET",
            remainingMinor: remainingMinor.toString(),
          },
          { status: 400 }
        );
      }
    }

    const config = await prisma.orgChainConfig.findUnique({
      where: { orgId },
    });
    if (!config?.token2022Mint || !config.treasuryTokenAccount) {
      opsLog.payFailure(requestId, "CHAIN_NOT_READY");
      return NextResponse.json(
        { error: "Run Solana demo setup (create mint and init accounts first)", code: "CHAIN_NOT_READY" },
        { status: 400 }
      );
    }

    const vendor = expenseRequest.vendor;
    if (vendor.status !== "ACTIVE") {
      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "PAYMENT_BLOCKED",
        entityType: "ExpenseRequest",
        entityId: requestId,
        metadata: { code: "VENDOR_INACTIVE" },
      });
      opsLog.payFailure(requestId, "VENDOR_INACTIVE");
      return NextResponse.json(
        { error: "Vendor must be active to receive payment. Activate the vendor in Vendors settings.", code: "VENDOR_INACTIVE" },
        { status: 400 }
      );
    }
    if (!vendor.ownerPubkey) {
      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "PAYMENT_BLOCKED",
        entityType: "ExpenseRequest",
        entityId: requestId,
        metadata: { code: "VENDOR_WALLET_NOT_SET" },
      });
      return NextResponse.json(
        { error: "Vendor wallet address (ownerPubkey) is not set. Set it in Vendors settings.", code: "VENDOR_WALLET_NOT_SET" },
        { status: 400 }
      );
    }

    const treasuryKeypair = getTreasuryKeypair();
    const treasuryPubkey = treasuryKeypair.publicKey.toBase58();
    if (vendor.ownerPubkey !== treasuryPubkey) {
      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "PAYMENT_BLOCKED",
        entityType: "ExpenseRequest",
        entityId: requestId,
        metadata: { code: "VENDOR_OWNER_NOT_SIGNABLE" },
      });
      opsLog.payFailure(requestId, "VENDOR_OWNER_NOT_SIGNABLE");
      return NextResponse.json(
        {
          error: "For this demo, the vendor wallet must be set to the treasury pubkey (self-pay) so the server can sign. Set the vendor owner to the treasury in Vendors settings.",
          code: "VENDOR_OWNER_NOT_SIGNABLE",
        },
        { status: 400 }
      );
    }

    let connection;
    try {
      connection = getConnection();
    } catch (e) {
      if (e instanceof RpcNotConfiguredError) {
        return NextResponse.json(
          { error: "Solana RPC not configured", code: "RPC_NOT_CONFIGURED" },
          { status: 503 }
        );
      }
      throw e;
    }
    const mint = new PublicKey(config.token2022Mint);
    const treasuryTokenAccount = new PublicKey(config.treasuryTokenAccount);
    const ownerPubkey = new PublicKey(vendor.ownerPubkey);

    const vendorTokenAccountAddress = await getOrCreateVendorAta(
      connection,
      treasuryKeypair,
      mint,
      ownerPubkey,
      vendor.tokenAccount,
      treasuryKeypair,
      TOKEN_2022_PROGRAM_ID
    );

    if (!vendor.tokenAccount) {
      await prisma.vendor.update({
        where: { id: vendor.id },
        data: { tokenAccount: vendorTokenAccountAddress },
      });
    }

    const memoMessage = buildRequestMemo(requestId, expenseRequest.org?.slug ?? undefined);
    const amount = expenseRequest.amountMinor;

    const txSignature = await transferWithMemo(
      connection,
      treasuryKeypair,
      treasuryTokenAccount,
      new PublicKey(vendorTokenAccountAddress),
      mint,
      amount,
      memoMessage,
      TOKEN_2022_PROGRAM_ID
    );

    const now = new Date();
    await prisma.expenseRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.PAID,
        paidAt: now,
        paidTxSig: txSignature,
        paidByUserId: user.id,
        paidToTokenAccount: vendorTokenAccountAddress,
      },
    });

    const paidMetadata: Record<string, unknown> = { paidTxSig: txSignature, memo: memoMessage };
    if (overBudgetOverride) paidMetadata.overBudgetOverride = true;

    await emitOutboxEvent({
      orgId,
      type: "PAYMENT_PAID",
      payload: {
        requestId,
        vendorId: expenseRequest.vendorId,
        amountMinor: expenseRequest.amountMinor.toString(),
        paidTxSig: txSignature,
        paidAt: now.toISOString(),
        paidByUserId: user.id,
      },
    });
    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "REQUEST_PAID",
      entityType: "ExpenseRequest",
      entityId: requestId,
      before: {
        status: RequestStatus.APPROVED,
        amountMinor: expenseRequest.amountMinor.toString(),
        vendorId: expenseRequest.vendorId,
        departmentId: expenseRequest.departmentId,
      },
      after: {
        status: RequestStatus.PAID,
        amountMinor: expenseRequest.amountMinor.toString(),
        vendorId: expenseRequest.vendorId,
        departmentId: expenseRequest.departmentId,
        paidAt: now.toISOString(),
        paidTxSig: txSignature,
        paidToTokenAccount: vendorTokenAccountAddress,
      },
      metadata: paidMetadata,
    });

    await createNotification({
      orgId,
      userId: expenseRequest.requesterUserId,
      type: "REQUEST_PAID",
      title: "Request paid",
      body: `Your request "${expenseRequest.title}" has been paid.`,
      link: `/app/requests/${requestId}`,
    });

    opsLog.paySuccess(requestId);
    const explorerLink = `https://explorer.solana.com/tx/${txSignature}?cluster=${cluster}`;

    return NextResponse.json({
      paidTxSig: txSignature,
      paidAt: now.toISOString(),
      paidToTokenAccount: vendorTokenAccountAddress,
      amountMinor: bigIntToString(amount),
      explorerLink,
    });
  } catch (e) {
    return safeApiError(e, "Payment failed");
  }
}
