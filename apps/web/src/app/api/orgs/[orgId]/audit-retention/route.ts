import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgWriteAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { auditRetentionSchema } from "@kharchapay/shared";

/**
 * GET /api/orgs/[orgId]/audit-retention
 * ADMIN + AUDITOR can view.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const row = await prisma.orgAuditRetention.findUnique({
      where: { orgId },
    });

    return NextResponse.json({
      retentionDays: row?.retentionDays ?? 365,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/**
 * PUT /api/orgs/[orgId]/audit-retention
 * ADMIN only. Body: { retentionDays } (30..3650).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await request.json();
    const parsed = auditRetentionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { retentionDays } = parsed.data;

    const row = await prisma.orgAuditRetention.upsert({
      where: { orgId },
      create: { orgId, retentionDays },
      update: { retentionDays },
    });

    return NextResponse.json({
      retentionDays: row.retentionDays,
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
