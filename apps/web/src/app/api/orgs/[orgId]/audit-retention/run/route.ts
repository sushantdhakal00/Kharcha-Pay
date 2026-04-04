import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";

/**
 * POST /api/orgs/[orgId]/audit-retention/run
 * ADMIN only. Deletes AuditEvent rows older than (now - retentionDays) for this org,
 * then logs an AUDIT_RETENTION_RUN event with metadata { deletedCount, retentionDays }.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(_request);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const row = await prisma.orgAuditRetention.findUnique({
      where: { orgId },
    });
    const retentionDays = row?.retentionDays ?? 365;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const deleted = await prisma.auditEvent.deleteMany({
      where: {
        orgId,
        createdAt: { lt: cutoff },
      },
    });
    const deletedCount = deleted.count;

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "AUDIT_RETENTION_RUN",
      entityType: "Organization",
      entityId: orgId,
      metadata: { deletedCount, retentionDays },
    });

    return NextResponse.json({
      deletedCount,
      retentionDays,
      cutoff: cutoff.toISOString(),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
