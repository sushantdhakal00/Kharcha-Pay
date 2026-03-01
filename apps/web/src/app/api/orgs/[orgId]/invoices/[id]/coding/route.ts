import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OrgRole } from "@prisma/client";
import { InvoiceStatus } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, id } = await params;
    const membership = await requireOrgRole(orgId, user.id, [
      OrgRole.ADMIN,
      OrgRole.APPROVER,
      OrgRole.STAFF,
    ]);

    const inv = await prisma.invoice.findFirst({
      where: { id, orgId },
    });
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const departmentId = (body.departmentId as string) || null;
    const costCenterId = (body.costCenterId as string) || null;
    const projectId = (body.projectId as string) || null;
    const glCode = (body.glCode as string)?.trim() || null;
    const reason = (body.reason as string)?.trim() || null;

    const isAdmin = membership.role === OrgRole.ADMIN;
    const isApprover = membership.role === OrgRole.APPROVER;

    if (membership.role === OrgRole.STAFF) {
      if (inv.status !== InvoiceStatus.DRAFT) {
        return NextResponse.json(
          { error: "Staff can edit coding only in DRAFT" },
          { status: 403 }
        );
      }
    } else if (isApprover && !isAdmin) {
      const allowed: InvoiceStatus[] = [
        InvoiceStatus.NEEDS_VERIFICATION,
        InvoiceStatus.EXCEPTION,
      ];
      if (!allowed.includes(inv.status)) {
        return NextResponse.json(
          { error: "Approver can edit coding only in NEEDS_VERIFICATION or EXCEPTION" },
          { status: 403 }
        );
      }
      if (!reason) {
        return NextResponse.json(
          { error: "Approver override requires reason" },
          { status: 400 }
        );
      }
    }
    if (!isAdmin && inv.type === "PO_INVOICE") {
      const po = await prisma.purchaseOrder.findFirst({
        where: { id: inv.poId! },
      });
      if (po && (inv.departmentId || inv.glCode)) {
        if (!reason && (departmentId !== inv.departmentId || glCode !== inv.glCode)) {
          return NextResponse.json(
            { error: "Changing PO-derived coding requires reason (Approver)" },
            { status: 400 }
          );
        }
      }
    }

    if (departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, orgId },
      });
      if (!dept) {
        return NextResponse.json({ error: "Department not found" }, { status: 400 });
      }
    }

    const before = {
      departmentId: inv.departmentId,
      costCenterId: inv.costCenterId,
      projectId: inv.projectId,
      glCode: inv.glCode,
    };

    await prisma.invoice.update({
      where: { id },
      data: {
        departmentId,
        costCenterId,
        projectId,
        glCode,
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "INVOICE_CODING_UPDATED",
      entityType: "Invoice",
      entityId: id,
      before,
      after: { departmentId, costCenterId, projectId, glCode },
      metadata: reason ? { reason } : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
