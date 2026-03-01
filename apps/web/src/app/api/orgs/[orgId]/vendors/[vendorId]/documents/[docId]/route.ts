/**
 * PATCH vendor document: verify or reject (Approver/Admin only)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { emitOutboxEvent } from "@/lib/outbox";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; vendorId: string; docId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, vendorId, docId } = await params;
    await requireOrgWriteAccess(orgId, user.id);
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN, OrgRole.APPROVER]);

    const doc = await prisma.vendorDocument.findFirst({
      where: { id: docId, vendorId },
    });
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, orgId } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const action = body.action as "verify" | "reject" | undefined;
    const notes = body.notes as string | undefined;

    if (action === "verify") {
      await prisma.vendorDocument.update({
        where: { id: docId },
        data: {
          status: "VERIFIED",
          verifiedByUserId: user.id,
          verifiedAt: new Date(),
          notes: notes ?? doc.notes,
        },
      });
      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "VENDOR_DOC_VERIFIED",
        entityType: "VendorDocument",
        entityId: docId,
        before: { status: doc.status },
        after: { status: "VERIFIED" },
      });
      await emitOutboxEvent({
        orgId,
        type: "VENDOR_DOC_VERIFIED",
        payload: { vendorId, documentId: docId },
      });
      return NextResponse.json({ updated: true, status: "VERIFIED" });
    }

    if (action === "reject") {
      await prisma.vendorDocument.update({
        where: { id: docId },
        data: {
          status: "REJECTED",
          verifiedByUserId: user.id,
          verifiedAt: new Date(),
          notes: notes ?? doc.notes,
        },
      });
      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "VENDOR_DOC_VERIFIED",
        entityType: "VendorDocument",
        entityId: docId,
        before: { status: doc.status },
        after: { status: "REJECTED" },
        metadata: { notes },
      });
      return NextResponse.json({ updated: true, status: "REJECTED" });
    }

    return NextResponse.json({ error: "action must be verify or reject" }, { status: 400 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
