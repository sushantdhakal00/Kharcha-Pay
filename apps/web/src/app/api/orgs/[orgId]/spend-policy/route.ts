import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgReadAccess, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { requireRecentAuth, REAUTH_MAX_AGE_SECONDS } from "@/lib/require-recent-auth";
import { OrgRole } from "@prisma/client";
import { spendPolicyUpsertSchema } from "@kharchapay/shared";
import { jsonResponse } from "@/lib/json-response";
import { logAuditEvent } from "@/lib/audit";

const DEFAULTS = {
  requireReceiptForPayment: true,
  receiptRequiredAboveMinor: BigInt(0),
  blockOverBudget: true,
  allowAdminOverrideOverBudget: false,
};

/**
 * GET /api/orgs/[orgId]/spend-policy — any org member
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const policy = await prisma.orgSpendPolicy.findUnique({
      where: { orgId },
    });

    if (!policy) {
      return jsonResponse({
        policy: {
          requireReceiptForPayment: DEFAULTS.requireReceiptForPayment,
          receiptRequiredAboveMinor: DEFAULTS.receiptRequiredAboveMinor.toString(),
          blockOverBudget: DEFAULTS.blockOverBudget,
          allowAdminOverrideOverBudget: DEFAULTS.allowAdminOverrideOverBudget,
        },
      });
    }

    return jsonResponse({
      policy: {
        id: policy.id,
        requireReceiptForPayment: policy.requireReceiptForPayment,
        receiptRequiredAboveMinor: policy.receiptRequiredAboveMinor.toString(),
        blockOverBudget: policy.blockOverBudget,
        allowAdminOverrideOverBudget: policy.allowAdminOverrideOverBudget,
        updatedAt: policy.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/**
 * PUT /api/orgs/[orgId]/spend-policy — ADMIN only
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    await requireRecentAuth(REAUTH_MAX_AGE_SECONDS);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await request.json();
    const parsed = spendPolicyUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { requireReceiptForPayment, receiptRequiredAboveMinor, blockOverBudget, allowAdminOverrideOverBudget } = parsed.data;
    const receiptMinor = typeof receiptRequiredAboveMinor === "number" ? BigInt(receiptRequiredAboveMinor) : BigInt(receiptRequiredAboveMinor);

    const existing = await prisma.orgSpendPolicy.findUnique({
      where: { orgId },
    });

    const policy = await prisma.orgSpendPolicy.upsert({
      where: { orgId },
      create: {
        orgId,
        requireReceiptForPayment,
        receiptRequiredAboveMinor: receiptMinor,
        blockOverBudget,
        allowAdminOverrideOverBudget,
      },
      update: {
        requireReceiptForPayment,
        receiptRequiredAboveMinor: receiptMinor,
        blockOverBudget,
        allowAdminOverrideOverBudget,
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "SPEND_POLICY_UPDATED",
      entityType: "OrgSpendPolicy",
      entityId: policy.id,
      before: existing
        ? {
            requireReceiptForPayment: existing.requireReceiptForPayment,
            receiptRequiredAboveMinor: existing.receiptRequiredAboveMinor.toString(),
            blockOverBudget: existing.blockOverBudget,
            allowAdminOverrideOverBudget: existing.allowAdminOverrideOverBudget,
          }
        : null,
      after: {
        requireReceiptForPayment: policy.requireReceiptForPayment,
        receiptRequiredAboveMinor: policy.receiptRequiredAboveMinor.toString(),
        blockOverBudget: policy.blockOverBudget,
        allowAdminOverrideOverBudget: policy.allowAdminOverrideOverBudget,
      },
    });

    return jsonResponse({
      policy: {
        id: policy.id,
        requireReceiptForPayment: policy.requireReceiptForPayment,
        receiptRequiredAboveMinor: policy.receiptRequiredAboveMinor.toString(),
        blockOverBudget: policy.blockOverBudget,
        allowAdminOverrideOverBudget: policy.allowAdminOverrideOverBudget,
        updatedAt: policy.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
