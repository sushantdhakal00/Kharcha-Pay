import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { OrgRole } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN, OrgRole.APPROVER]);

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    const invoices = await prisma.invoice.findMany({
      where: { id: { in: ids }, orgId },
      select: { id: true },
    });
    const validIds = invoices.map((i) => i.id);

    await prisma.invoice.updateMany({
      where: { id: { in: validIds } },
      data: { assignedToUserId: user.id, assignedAt: new Date() },
    });

    for (const id of validIds) {
      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "INVOICE_ASSIGNED",
        entityType: "Invoice",
        entityId: id,
        metadata: { assignedToUserId: user.id },
      });
    }

    return NextResponse.json({ ok: true, assigned: validIds.length });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
