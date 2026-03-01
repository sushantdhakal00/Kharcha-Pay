/**
 * Vendor documents: list (GET), upload (POST). Verify/Reject via PATCH on document.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgWriteAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { emitOutboxEvent } from "@/lib/outbox";
import { ensureVendorDocumentDir } from "@/lib/vendor-document-storage";
import { writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const DOC_TYPES = ["W9", "W8BEN", "VAT", "CONTRACT", "INSURANCE", "OTHER"] as const;
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function validateFile(buffer: Buffer, mimeType: string, sizeBytes: number): { allowed: boolean; error?: string } {
  if (sizeBytes > MAX_SIZE) return { allowed: false, error: "File too large (max 5MB)" };
  const mime = mimeType?.toLowerCase();
  if (!mime || !ALLOWED_MIME.includes(mime)) return { allowed: false, error: "Invalid file type (PDF, JPEG, PNG, WebP only)" };
  return { allowed: true };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; vendorId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, vendorId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, orgId } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const docs = await prisma.vendorDocument.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      documents: docs.map((d) => ({
        id: d.id,
        type: d.type,
        fileName: d.fileName,
        status: d.status,
        verifiedAt: d.verifiedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; vendorId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, vendorId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, orgId } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;
    if (!file || !(file instanceof File) || !type || !DOC_TYPES.includes(type as typeof DOC_TYPES[number])) {
      return NextResponse.json(
        { error: "file and type (W9|W8BEN|VAT|CONTRACT|INSURANCE|OTHER) required" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateFile(buffer, file.type || "application/octet-stream", buffer.length);
    if (!validation.allowed) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const dir = await ensureVendorDocumentDir(orgId);
    const storageKey = crypto.randomBytes(16).toString("hex");
    const ext = path.extname(file.name) || (file.type === "application/pdf" ? ".pdf" : ".bin");
    const safeFileName = storageKey + ext;
    const filePath = path.join(dir, safeFileName);
    await writeFile(filePath, buffer);

    const doc = await prisma.vendorDocument.create({
      data: {
        vendorId,
        type: type as typeof DOC_TYPES[number],
        storageKey: safeFileName,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: buffer.length,
        status: "RECEIVED",
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "VENDOR_DOC_UPLOADED",
      entityType: "VendorDocument",
      entityId: doc.id,
      metadata: { vendorId, type, fileName: file.name },
    });

    return NextResponse.json({
      document: {
        id: doc.id,
        type: doc.type,
        fileName: doc.fileName,
        status: doc.status,
        createdAt: doc.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
