import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import {
  getActivePolicy,
  resolveRules,
  DEFAULT_POLICY_RULES,
} from "@/lib/fiat/treasury-policy";

const updatePolicySchema = z.object({
  rules: z.object({
    dailyLimitMinor: z.number().int().positive().optional(),
    weeklyLimitMinor: z.number().int().positive().optional(),
    monthlyLimitMinor: z.number().int().positive().optional(),
    perVendorDailyLimitMinor: z.number().int().positive().optional(),
    maxPayoutsPerDay: z.number().int().positive().optional(),
    maxPayoutsPerVendorPerDay: z.number().int().positive().optional(),
    requireApprovalOverMinor: z.number().int().nonnegative().optional(),
    allowedRails: z.array(z.string()).optional(),
    allowedProviders: z.array(z.string()).optional(),
    vendorAllowlist: z.array(z.string()).optional(),
    countryAllowlist: z.array(z.string()).optional(),
  }),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const policy = await getActivePolicy(prisma as never, orgId);
    const rules = resolveRules(policy);

    return jsonResponse({
      policy: policy
        ? { id: policy.id, version: policy.version, rules }
        : null,
      effectiveRules: rules,
      defaults: DEFAULT_POLICY_RULES,
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
    const parsed = updatePolicySchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await getActivePolicy(prisma as never, orgId);
    const nextVersion = existing ? existing.version + 1 : 1;

    if (existing) {
      await prisma.treasuryPolicy.updateMany({
        where: { orgId, isActive: true },
        data: { isActive: false },
      });
    }

    const newPolicy = await prisma.treasuryPolicy.create({
      data: {
        orgId,
        version: nextVersion,
        isActive: true,
        rules: parsed.data.rules as object,
      },
    });

    return jsonResponse({
      policy: {
        id: newPolicy.id,
        version: newPolicy.version,
        rules: parsed.data.rules,
      },
      effectiveRules: resolveRules({ rules: parsed.data.rules }),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
