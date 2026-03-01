import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { unlink } from "fs/promises";
import path from "path";
import { logAuditEvent } from "@/lib/audit";
import { getInvoiceAttachmentDir } from "@/lib/invoice-attachment-storage";
import { OrgRole } from "@prisma/client";
import { InvoiceStatus } from "@prisma/client";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string; attachmentId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, id: invoiceId, attachmentId } = await params;
    const membership = await requireOrgRole(orgId, user.id, [
      OrgRole.ADMIN,
      OrgRole.APPROVER,
      OrgRole.STAFF,
    ]);

    const inv = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
    });
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const attachment = await prisma.invoiceAttachment.findFirst({
      where: { id: attachmentId, invoiceId },
    });
    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const canRemove =
      inv.status === InvoiceStatus.DRAFT || membership.role === OrgRole.ADMIN;
    if (!canRemove) {
      return NextResponse.json(
        {
          error:
            "Attachments can only be removed when invoice is DRAFT, or by Admin",
        },
        { status: 403 }
      );
    }

    if (attachment.storageKey) {
      const dir = getInvoiceAttachmentDir(orgId);
      const filePath = path.join(dir, attachment.storageKey);
      try {
        await unlink(filePath);
      } catch {
        // best effort; continue to delete DB record
      }
    }

    await prisma.invoiceAttachment.delete({
      where: { id: attachmentId },
    });

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { attachmentCount: { decrement: 1 } },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "INVOICE_ATTACHMENT_REMOVED",
      entityType: "InvoiceAttachment",
      entityId: attachmentId,
      metadata: { invoiceId, fileName: attachment.fileName },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
