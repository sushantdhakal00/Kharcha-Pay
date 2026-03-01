import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { prisma } from "@/lib/db";
import { requireCsrf } from "@/lib/auth";
import { jwtVerify } from "jose";
import { writeFile } from "fs/promises";
import path from "path";
import { env } from "@/lib/env";
import { logAuditEvent } from "@/lib/audit";
import { ensureInvoiceAttachmentDir } from "@/lib/invoice-attachment-storage";
import { validateInvoiceAttachment } from "@/lib/invoice-attachment-upload";

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, id: invoiceId } = await params;

    const token = req.headers.get("x-upload-token");
    if (!token) {
      return NextResponse.json({ error: "X-Upload-Token required" }, { status: 400 });
    }

    let payload: {
      invoiceId: string;
      orgId: string;
      storageKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      userId: string;
    };
    try {
      const { payload: p } = await jwtVerify(token, JWT_SECRET);
      payload = p as typeof payload;
    } catch {
      return NextResponse.json({ error: "Invalid or expired upload token" }, { status: 400 });
    }

    if (payload.invoiceId !== invoiceId || payload.orgId !== orgId) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 400 });
    }
    if (payload.userId !== user.id) {
      return NextResponse.json({ error: "Token user mismatch" }, { status: 403 });
    }

    const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, orgId } });
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateInvoiceAttachment(buffer, payload.mimeType, payload.sizeBytes);
    if (!validation.allowed) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const dir = await ensureInvoiceAttachmentDir(orgId);
    const storageKey = payload.storageKey;
    const ext =
      path.extname(payload.fileName) ||
      (payload.mimeType === "application/pdf" ? ".pdf" : ".bin");
    const safeFileName = storageKey + ext;
    const filePath = path.join(dir, safeFileName);
    await writeFile(filePath, buffer);

    const attachment = await prisma.invoiceAttachment.create({
      data: {
        invoiceId,
        orgId,
        storageKey: safeFileName,
        fileName: payload.fileName,
        mimeType: validation.detectedMime,
        sizeBytes: buffer.length,
        uploadedByUserId: user.id,
      },
    });

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { attachmentCount: { increment: 1 } },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "INVOICE_ATTACHMENT_ADDED",
      entityType: "InvoiceAttachment",
      entityId: attachment.id,
      metadata: { invoiceId, fileName: payload.fileName, sizeBytes: buffer.length },
    });

    return NextResponse.json({
      attachment: {
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
