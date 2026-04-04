import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { OrgRole } from "@prisma/client";

const DOWNLOAD_URL_EXPIRY_SEC = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string; attachmentId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, id: invoiceId, attachmentId } = await params;
    const membership = await requireOrgReadAccess(orgId, user.id);

    const attachment = await prisma.invoiceAttachment.findFirst({
      where: { id: attachmentId, invoiceId, invoice: { orgId } },
    });
    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const downloadUrl = `${baseUrl}/api/orgs/${orgId}/invoices/${invoiceId}/attachments/${attachmentId}/download?token=${encodeURIComponent(await getDownloadToken(attachmentId, user.id))}`;

    if (membership.role === OrgRole.ADMIN || membership.role === OrgRole.APPROVER) {
      await logAuditEvent({
        orgId,
        actorUserId: user.id,
        action: "INVOICE_ATTACHMENT_DOWNLOADED",
        entityType: "InvoiceAttachment",
        entityId: attachmentId,
        metadata: { invoiceId, fileName: attachment.fileName },
      });
    }

    return NextResponse.json({
      downloadUrl,
      expiresInSeconds: DOWNLOAD_URL_EXPIRY_SEC,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

async function getDownloadToken(attachmentId: string, userId: string): Promise<string> {
  const { SignJWT } = await import("jose");
  const { env } = await import("@/lib/env");
  return new SignJWT({ attachmentId, userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DOWNLOAD_URL_EXPIRY_SEC}s`)
    .sign(new TextEncoder().encode(env.JWT_SECRET));
}
