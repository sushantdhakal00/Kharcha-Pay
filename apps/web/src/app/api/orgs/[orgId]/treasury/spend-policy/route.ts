import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { logTreasuryAudit } from "@/lib/fiat/treasury-audit";
import { emitTreasuryEvent, spendPolicyDedupKey } from "@/lib/fiat/treasury-events";

const DEFAULTS = {
  maxHotTransferMinor: BigInt(500000),
  requireApprovalOverMinor: BigInt(1000000),
  dailyHotCapMinor: BigInt(5000000),
};

const updateSpendPolicySchema = z.object({
  maxHotTransferMinor: z.number().int().positive().optional(),
  requireApprovalOverMinor: z.number().int().positive().optional(),
  dailyHotCapMinor: z.number().int().positive().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const policy = await prisma.treasurySpendPolicy.findUnique({
      where: { orgId },
    });

    return jsonResponse({
      policy: policy ?? null,
      effective: {
        maxHotTransferMinor: (policy?.maxHotTransferMinor ?? DEFAULTS.maxHotTransferMinor).toString(),
        requireApprovalOverMinor: (policy?.requireApprovalOverMinor ?? DEFAULTS.requireApprovalOverMinor).toString(),
        dailyHotCapMinor: (policy?.dailyHotCapMinor ?? DEFAULTS.dailyHotCapMinor).toString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await req.json().catch(() => ({}));
    const parsed = updateSpendPolicySchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.maxHotTransferMinor !== undefined) {
      data.maxHotTransferMinor = BigInt(parsed.data.maxHotTransferMinor);
    }
    if (parsed.data.requireApprovalOverMinor !== undefined) {
      data.requireApprovalOverMinor = BigInt(parsed.data.requireApprovalOverMinor);
    }
    if (parsed.data.dailyHotCapMinor !== undefined) {
      data.dailyHotCapMinor = BigInt(parsed.data.dailyHotCapMinor);
    }

    const policy = await prisma.treasurySpendPolicy.upsert({
      where: { orgId },
      create: { orgId, ...data } as never,
      update: data,
    });

    await logTreasuryAudit({
      orgId,
      actorId: user.id,
      action: "SPEND_POLICY_UPDATED",
      entityType: "TreasurySpendPolicy",
      entityId: policy.id,
      metadata: parsed.data,
    });

    await emitTreasuryEvent({
      orgId,
      type: "SPEND_POLICY_UPDATED",
      entityType: "TreasurySpendPolicy",
      entityId: policy.id,
      dedupKey: spendPolicyDedupKey(orgId),
      payload: { policyId: policy.id, changes: parsed.data },
    }).catch(() => {});

    return jsonResponse({ policy });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
