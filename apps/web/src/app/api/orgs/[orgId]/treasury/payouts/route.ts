import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TreasuryRiskStatus } from "@prisma/client";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import {
  createPayoutIntent,
  fundOnChainIfRequired,
  PayoutFundingUnsupportedError,
  UnsupportedRailError,
  UnsupportedCurrencyError,
  RailValidationError,
} from "@/lib/fiat/fiat-payout-service";
import { FiatDisabledError, FiatProviderError } from "@/lib/fiat/fiat-service";
import { getRailDisabledReason, RAIL_DISABLED_MESSAGES } from "@/lib/fiat/payout-providers/capabilities";
import {
  getActivePolicy,
  resolveRules,
  computeHistoricalStats,
  evaluatePayoutRisk,
  enforcePayoutPolicyOrThrow,
  TreasuryPolicyViolationError,
} from "@/lib/fiat/treasury-policy";
import { logTreasuryAudit } from "@/lib/fiat/treasury-audit";
import {
  emitTreasuryEvent,
  approvalRequestedDedupKey,
  policyBlockedDedupKey,
  buildPayoutEventPayload,
} from "@/lib/fiat/treasury-events";

const createPayoutSchema = z.object({
  vendorId: z.string().optional(),
  amount: z.number().positive("Amount must be positive").max(1e7, "Amount exceeds limit"),
  currency: z.enum(["USD"]).optional().default("USD"),
  note: z.string().max(500).optional(),
  payoutRail: z.enum(["BANK_WIRE", "ACH", "LOCAL"]).optional().default("BANK_WIRE"),
  provider: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const idempotencyKey =
      req.headers.get("idempotency-key") ??
      req.headers.get("x-idempotency-key") ??
      undefined;

    const body = await req.json().catch(() => ({}));
    const parsed = createPayoutSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { vendorId, amount, currency, note, payoutRail, provider } = parsed.data;
    const amountMinor = BigInt(Math.round(amount * 100));
    const providerStr = provider ?? "CIRCLE";

    if (vendorId) {
      const vendor = await prisma.vendor.findFirst({
        where: { id: vendorId, orgId },
        select: { id: true },
      });
      if (!vendor) {
        return jsonResponse({ error: "Vendor not found in this org" }, { status: 404 });
      }
    }

    // --- Policy evaluation ---
    const activePolicy = await getActivePolicy(prisma as never, orgId);
    const rules = resolveRules(activePolicy);
    const stats = await computeHistoricalStats(prisma as never, orgId, vendorId);

    let vendorCountry: string | null = null;
    if (vendorId) {
      const profile = await prisma.vendorFiatPayoutProfile.findUnique({
        where: { vendorId },
        select: { payoutDetailsJson: true },
      });
      const details = profile?.payoutDetailsJson as Record<string, unknown> | null;
      vendorCountry = (details?.country as string) ?? null;
    }

    const policyResult = evaluatePayoutRisk(
      { amountMinor, currency, vendorId, payoutRail, provider: providerStr, vendorCountry },
      rules,
      stats
    );

    await logTreasuryAudit({
      orgId,
      actorId: user.id,
      action: "POLICY_EVALUATED",
      entityType: "TreasuryPolicy",
      entityId: activePolicy?.id ?? "default",
      metadata: {
        riskStatus: policyResult.riskStatus,
        reasons: policyResult.reasons,
        amountMinor: amountMinor.toString(),
        vendorId,
      },
    });

    if (policyResult.riskStatus === TreasuryRiskStatus.BLOCKED) {
      enforcePayoutPolicyOrThrow(policyResult);
    }

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true },
    });

    if (policyResult.riskStatus === TreasuryRiskStatus.REQUIRES_APPROVAL) {
      const intent = await prisma.treasuryPayoutIntent.create({
        data: {
          orgId,
          provider: providerStr.toUpperCase(),
          status: "CREATED",
          amountMinor,
          currency,
          vendorId: vendorId ?? null,
          createdByUserId: user.id,
          payoutRail: payoutRail as "BANK_WIRE" | "ACH" | "LOCAL",
          note: note ?? null,
          idempotencyKey: idempotencyKey ?? null,
          riskStatus: TreasuryRiskStatus.REQUIRES_APPROVAL,
          riskReasons: policyResult.reasons,
          requestedAt: new Date(),
        },
      });

      const approval = await prisma.treasuryPayoutApproval.create({
        data: {
          orgId,
          intentId: intent.id,
          status: "REQUESTED",
          requestedByUserId: user.id,
          reason: policyResult.reasons.join("; "),
        },
      });

      await prisma.treasuryPayoutIntent.update({
        where: { id: intent.id },
        data: { approvalId: approval.id },
      });

      await logTreasuryAudit({
        orgId,
        actorId: user.id,
        action: "PAYOUT_APPROVAL_REQUESTED",
        entityType: "TreasuryPayoutIntent",
        entityId: intent.id,
        metadata: {
          approvalId: approval.id,
          reasons: policyResult.reasons,
          amountMinor: amountMinor.toString(),
        },
      });

      await emitTreasuryEvent({
        orgId,
        type: "PAYOUT_APPROVAL_REQUESTED",
        entityType: "TreasuryPayoutIntent",
        entityId: intent.id,
        dedupKey: approvalRequestedDedupKey(intent.id),
        payload: {
          intentId: intent.id,
          approvalId: approval.id,
          vendorId: vendorId ?? null,
          amountMinor: amountMinor.toString(),
          currency,
          riskReasons: policyResult.reasons,
        },
      }).catch(() => {});

      return jsonResponse({
        id: intent.id,
        status: intent.status,
        currency,
        amount: Number(amountMinor) / 100,
        provider: providerStr.toUpperCase(),
        payoutRail,
        riskStatus: "REQUIRES_APPROVAL",
        riskReasons: policyResult.reasons,
        approvalId: approval.id,
        approvalStatus: "REQUESTED",
      });
    }

    // CLEAR path — proceed with normal payout creation
    const intent = await createPayoutIntent({
      orgId,
      orgName: org.name,
      vendorId,
      amountMinor,
      currency,
      createdByUserId: user.id,
      note,
      idempotencyKey,
      payoutRail: payoutRail as "BANK_WIRE" | "ACH" | "LOCAL",
      provider: providerStr,
    });

    await prisma.treasuryPayoutIntent.update({
      where: { id: intent.id },
      data: { riskStatus: TreasuryRiskStatus.CLEAR },
    });

    let fundingNote: string | undefined;
    try {
      await fundOnChainIfRequired(orgId, intent.id);
    } catch (e) {
      if (e instanceof PayoutFundingUnsupportedError) {
        fundingNote = e.message;
      }
    }

    const amountMajor = Number(intent.amountMinor) / 100;

    const railDisabledReason = getRailDisabledReason(
      providerStr,
      payoutRail as "BANK_WIRE" | "ACH" | "LOCAL",
      currency
    );

    return jsonResponse({
      id: intent.id,
      status: intent.status,
      currency: intent.currency,
      amount: amountMajor,
      provider: intent.provider,
      payoutRail: intent.payoutRail,
      circlePayoutId: intent.circlePayoutId,
      providerPayoutId: intent.providerPayoutId,
      note: intent.note,
      riskStatus: "CLEAR",
      fundingNote,
      railDisabledReason: railDisabledReason
        ? RAIL_DISABLED_MESSAGES[railDisabledReason]
        : null,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof TreasuryPolicyViolationError) {
      await logTreasuryAudit({
        orgId: "",
        action: "POLICY_BLOCKED_PAYOUT",
        entityType: "TreasuryPayoutIntent",
        entityId: "blocked",
        metadata: { reasons: e.reasons },
      }).catch(() => {});
      return jsonResponse(
        { error: "Payout blocked by treasury policy", code: "POLICY_BLOCKED", reasons: e.reasons },
        { status: 403 }
      );
    }
    if (e instanceof FiatDisabledError) {
      return jsonResponse(
        { error: "Fiat payouts not configured", code: "FIAT_DISABLED" },
        { status: 503 }
      );
    }
    if (e instanceof UnsupportedRailError) {
      return jsonResponse(
        {
          error: e.message,
          code: "UNSUPPORTED_RAIL",
          provider: e.provider,
          rail: e.rail,
          currency: e.currency,
        },
        { status: 400 }
      );
    }
    if (e instanceof UnsupportedCurrencyError) {
      return jsonResponse(
        {
          error: e.message,
          code: "UNSUPPORTED_CURRENCY",
          provider: e.provider,
          currency: e.currency,
        },
        { status: 400 }
      );
    }
    if (e instanceof RailValidationError) {
      return jsonResponse(
        {
          error: e.message,
          code: "RAIL_VALIDATION_ERROR",
          fieldErrors: e.fieldErrors,
        },
        { status: 400 }
      );
    }
    if (e instanceof FiatProviderError) {
      return jsonResponse(
        { error: "Fiat provider error", code: "FIAT_PROVIDER_ERROR" },
        { status: 502 }
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const intents = await prisma.treasuryPayoutIntent.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        amountMinor: true,
        currency: true,
        vendorId: true,
        provider: true,
        payoutRail: true,
        circlePayoutId: true,
        providerPayoutId: true,
        onchainTxSig: true,
        note: true,
        failureCode: true,
        failureMessage: true,
        riskStatus: true,
        riskReasons: true,
        approvalId: true,
        requestedAt: true,
        approvedAt: true,
        createdAt: true,
      },
    });

    const vendorIds = intents
      .map((i) => i.vendorId)
      .filter((v): v is string => !!v);

    const vendors =
      vendorIds.length > 0
        ? await prisma.vendor.findMany({
            where: { id: { in: vendorIds } },
            select: { id: true, name: true },
          })
        : [];

    const vendorMap = new Map(vendors.map((v) => [v.id, v.name]));

    const approvalIntentIds = intents
      .filter((i) => i.riskStatus === "REQUIRES_APPROVAL")
      .map((i) => i.id);

    const approvals =
      approvalIntentIds.length > 0
        ? await prisma.treasuryPayoutApproval.findMany({
            where: { intentId: { in: approvalIntentIds } },
            select: { intentId: true, status: true, reason: true },
          })
        : [];

    const approvalMap = new Map(approvals.map((a) => [a.intentId, a]));

    const rows = intents.map((i) => {
      const approval = approvalMap.get(i.id);
      return {
        id: i.id,
        status: i.status,
        amount: Number(i.amountMinor) / 100,
        currency: i.currency,
        vendorId: i.vendorId,
        vendorName: i.vendorId ? vendorMap.get(i.vendorId) ?? null : null,
        provider: i.provider,
        payoutRail: i.payoutRail,
        circlePayoutId: i.circlePayoutId,
        providerPayoutId: i.providerPayoutId,
        onchainTxSig: i.onchainTxSig,
        note: i.note,
        failureCode: i.failureCode,
        failureMessage: i.failureMessage,
        riskStatus: i.riskStatus,
        riskReasons: i.riskReasons,
        approvalStatus: approval?.status ?? null,
        approvalReason: approval?.reason ?? null,
        createdAt: i.createdAt.toISOString(),
      };
    });

    return jsonResponse({ payouts: rows });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
