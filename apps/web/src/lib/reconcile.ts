/**
 * Reconciliation service: verify paid requests against on-chain transactions.
 * Batches and throttles to avoid RPC rate limits.
 */
import { prisma } from "./db";
import { RequestStatus } from "@prisma/client";
import { verifyPaymentOnChain, type VerifyPaymentResult, type VerifyRpcClient } from "./solana/verify-payment";
import { RpcNotConfiguredError } from "./solana/rpc";
import { logAuditEvent } from "./audit";
import { PaymentVerificationStatus } from "@prisma/client";

const MAX_PER_RUN = 50;
const DELAY_MS = 200;
const RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientRpcError(result: { status: string; reasons: string[] }): boolean {
  if (result.status !== "FAILED") return false;
  return result.reasons.some(
    (r) => /RPC_TIMEOUT|RPC_UNAVAILABLE|timeout|ETIMEDOUT|ECONNREFUSED|fetch failed/i.test(r)
  );
}

export interface ReconcileRunResult {
  total: number;
  verified: number;
  warning: number;
  failed: number;
  pending: number;
  errors: string[];
}

/**
 * Reconcile last N paid requests or all since last run.
 * Throttles with delay between each verification. Bounded retries on transient RPC errors.
 */
export async function runReconciliationForOrg(
  orgId: string,
  options: { limit?: number; actorUserId?: string }
): Promise<ReconcileRunResult> {
  const start = Date.now();
  const limit = Math.min(options.limit ?? MAX_PER_RUN, MAX_PER_RUN);
  const errors: string[] = [];

  const paid = await prisma.expenseRequest.findMany({
    where: { orgId, status: RequestStatus.PAID },
    include: {
      vendor: true,
      org: { select: { slug: true } },
    },
    orderBy: { paidAt: "desc" },
    take: limit,
  });

  const counts = { verified: 0, warning: 0, failed: 0, pending: 0 };

  await logAuditEvent({
    orgId,
    actorUserId: options.actorUserId ?? null,
    action: "RECONCILIATION_RUN_STARTED",
    entityType: "PaymentReconciliation",
    entityId: orgId,
    metadata: { count: paid.length },
  });

  for (const req of paid) {
    try {
      let result = await verifySingleRequest(orgId, req.id, options.actorUserId);
      if (result && isTransientRpcError(result)) {
        await sleep(RETRY_DELAY_MS);
        result = await verifySingleRequest(orgId, req.id, options.actorUserId) ?? result;
      }
      if (result) {
        if (result.status === "VERIFIED") counts.verified++;
        else if (result.status === "WARNING") counts.warning++;
        else if (result.status === "FAILED") counts.failed++;
        else counts.pending++;
      }
      await sleep(DELAY_MS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${req.id}: ${msg}`);
    }
  }

  const durationMs = Date.now() - start;

  await logAuditEvent({
    orgId,
    actorUserId: options.actorUserId ?? null,
    action: "RECONCILIATION_RUN_FINISHED",
    entityType: "PaymentReconciliation",
    entityId: orgId,
    metadata: {
      total: paid.length,
      verified: counts.verified,
      warning: counts.warning,
      failed: counts.failed,
      pending: counts.pending,
      errorCount: errors.length,
      durationMs,
    },
  });

  try {
    const { opsLog } = await import("./ops-log");
    opsLog.reconcileComplete(orgId, paid.length, counts.verified, counts.failed, durationMs);
    if (errors.length > 0) {
      const rpcErrors = errors.filter((e) => /RPC_|timeout|unavailable/i.test(e));
      if (rpcErrors.length > 0) opsLog.reconcileError(orgId, "RPC_ERROR");
    }
  } catch {
    // ops log is best-effort
  }

  return {
    total: paid.length,
    ...counts,
    errors,
  };
}

/**
 * Verify a single request and upsert PaymentReconciliation.
 * Pass rpc for tests (mock). Always writes a record (VERIFIED/FAILED/WARNING) so UI doesn't stay "Not checked".
 */
export async function verifySingleRequest(
  orgId: string,
  requestId: string,
  actorUserId?: string,
  rpc?: VerifyRpcClient
): Promise<VerifyPaymentResult | null> {
  const request = await prisma.expenseRequest.findFirst({
    where: { id: requestId, orgId },
    include: {
      vendor: true,
      org: { select: { slug: true } },
    },
  });

  if (!request || request.status !== RequestStatus.PAID) return null;

  const config = await prisma.orgChainConfig.findUnique({
    where: { orgId },
  });

  if (!config) return null;

  let result: VerifyPaymentResult;
  try {
    result = await verifyPaymentOnChain({
    orgId,
    requestId,
    request: {
      paidTxSig: request.paidTxSig,
      amountMinor: request.amountMinor,
    },
    vendor: {
      tokenAccount: request.vendor.tokenAccount,
      ownerPubkey: request.vendor.ownerPubkey,
    },
    org: { slug: request.org.slug },
    chainConfig: {
      token2022Mint: config.token2022Mint,
      treasuryTokenAccount: config.treasuryTokenAccount,
      treasuryOwnerPubkey: config.treasuryOwnerPubkey,
      tokenProgramId: config.tokenProgramId,
    },
    rpc,
  });
  } catch (e) {
    const code =
      e instanceof RpcNotConfiguredError
        ? "RPC_NOT_CONFIGURED"
        : (() => {
            const msg = e instanceof Error ? e.message : String(e);
            if (/timeout|timed out|ETIMEDOUT|RPC_TIMEOUT/i.test(msg)) return "RPC_TIMEOUT";
            if (/ECONNREFUSED|fetch failed|unavailable|RPC_UNAVAILABLE/i.test(msg)) return "RPC_UNAVAILABLE";
            return "RPC_ERROR";
          })();
    const expectedMemo = request.org?.slug
      ? `KharchaPay Request ${requestId} ${request.org.slug}`
      : `KharchaPay Request ${requestId}`;
    result = {
      status: "FAILED",
      reasons: [code],
      expected: {
        memo: expectedMemo,
        amountMinor: request.amountMinor.toString(),
        source: config.treasuryTokenAccount ?? config.treasuryOwnerPubkey,
        destination: request.vendor.tokenAccount ?? request.vendor.ownerPubkey ?? "",
        mint: config.token2022Mint ?? "",
        tokenProgram: config.tokenProgramId,
      },
    };
  }

  const status = result.status as PaymentVerificationStatus;

  const detailsJson = {
    reasons: result.reasons,
    observed: result.observed,
    expected: result.expected,
  };

  const blockTime = result.blockTime != null ? new Date(result.blockTime * 1000) : undefined;

  await prisma.paymentReconciliation.upsert({
    where: { requestId },
    create: {
      orgId,
      requestId,
      txSig: request.paidTxSig ?? "",
      status,
      detailsJson: detailsJson as object,
      chainSlot: result.chainSlot ?? undefined,
      blockTime,
    },
    update: {
      txSig: request.paidTxSig ?? "",
      status,
      detailsJson: detailsJson as object,
      checkedAt: new Date(),
      chainSlot: result.chainSlot ?? undefined,
      blockTime,
    },
  });

  if (result.status === "VERIFIED") {
    await logAuditEvent({
      orgId,
      actorUserId: actorUserId ?? null,
      action: "PAYMENT_VERIFIED",
      entityType: "ExpenseRequest",
      entityId: requestId,
      metadata: { requestId },
    });
  } else if (result.status === "FAILED" || result.status === "WARNING") {
    await logAuditEvent({
      orgId,
      actorUserId: actorUserId ?? null,
      action: "PAYMENT_VERIFICATION_FAILED",
      entityType: "ExpenseRequest",
      entityId: requestId,
      metadata: { requestId, reasons: result.reasons },
    });
  }

  return result;
}
