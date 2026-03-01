import { NextResponse } from "next/server";
import { approvalPolicyUpsertSchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgReadAccess, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { requireRecentAuth, REAUTH_MAX_AGE_SECONDS } from "@/lib/require-recent-auth";
import { OrgRole } from "@prisma/client";
import { bigIntToString } from "@/lib/bigint";

/**
 * GET /api/orgs/[orgId]/approval-policy
 * Any member can view. Returns policy with tiers (minAmountMinor as string).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const policy = await prisma.approvalPolicy.findUnique({
      where: { orgId },
      include: {
        tiers: { orderBy: { minAmountMinor: "asc" } },
      },
    });

    if (!policy) {
      return NextResponse.json({
        policy: null,
        tiers: [],
        defaultRequiredApprovals: 1,
      });
    }

    return NextResponse.json({
      policy: {
        id: policy.id,
        orgId: policy.orgId,
        createdAt: policy.createdAt.toISOString(),
        updatedAt: policy.updatedAt.toISOString(),
      },
      tiers: policy.tiers.map((t) => ({
        id: t.id,
        minAmountMinor: bigIntToString(t.minAmountMinor),
        requiredApprovals: t.requiredApprovals,
      })),
      defaultRequiredApprovals: 1,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/**
 * PUT /api/orgs/[orgId]/approval-policy
 * ADMIN only. Body: { tiers: [{ minAmountMinor, requiredApprovals }, { ... }] } (exactly 2 tiers).
 */
export async function PUT(
  request: Request,
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
    const parsed = approvalPolicyUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { tiers } = parsed.data;

    const [tier1, tier2] = tiers;
    const min1 = BigInt(tier1.minAmountMinor);
    const min2 = BigInt(tier2.minAmountMinor);
    if (min1 > min2) {
      return NextResponse.json(
        { error: "Tier 1 minAmountMinor must be <= Tier 2 minAmountMinor" },
        { status: 400 }
      );
    }

    const policy = await prisma.approvalPolicy.upsert({
      where: { orgId },
      create: { orgId },
      update: {},
      include: { tiers: true },
    });

    await prisma.approvalTier.deleteMany({ where: { policyId: policy.id } });
    await prisma.approvalTier.createMany({
      data: [
        { policyId: policy.id, minAmountMinor: min1, requiredApprovals: tier1.requiredApprovals },
        { policyId: policy.id, minAmountMinor: min2, requiredApprovals: tier2.requiredApprovals },
      ],
    });

    const updated = await prisma.approvalPolicy.findUnique({
      where: { orgId },
      include: { tiers: { orderBy: { minAmountMinor: "asc" } } },
    });
    if (!updated) throw new Error("Unexpected");

    return NextResponse.json({
      policy: {
        id: updated.id,
        orgId: updated.orgId,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
      tiers: updated.tiers.map((t) => ({
        id: t.id,
        minAmountMinor: bigIntToString(t.minAmountMinor),
        requiredApprovals: t.requiredApprovals,
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
