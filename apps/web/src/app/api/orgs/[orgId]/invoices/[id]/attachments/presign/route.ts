import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SignJWT } from "jose";
import { randomBytes } from "crypto";
import { env } from "@/lib/env";
import {
  INVOICE_ATTACHMENT_MAX_BYTES,
  ALLOWED_MIME_TYPES,
} from "@/lib/invoice-attachment-upload";
import { OrgRole } from "@prisma/client";

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const UPLOAD_TOKEN_EXPIRY_SEC = 15 * 60; // 15 min

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId, id: invoiceId } = await params;
    const membership = await requireOrgWriteAccess(orgId, user.id);

    const inv = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
    });
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    const canAccess =
      membership.role === OrgRole.ADMIN ||
      membership.role === OrgRole.APPROVER ||
      membership.role === OrgRole.STAFF;
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const fileName = String(body.fileName ?? "").trim();
    const mimeType = String(body.mimeType ?? "").trim().toLowerCase();
    const sizeBytes = Number(body.sizeBytes) || 0;

    if (!fileName) {
      return NextResponse.json({ error: "fileName required" }, { status: 400 });
    }
    if (sizeBytes <= 0 || sizeBytes > INVOICE_ATTACHMENT_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `sizeBytes must be 1–${INVOICE_ATTACHMENT_MAX_BYTES} (max 10MB)`,
        },
        { status: 400 }
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
      return NextResponse.json(
        {
          error: "mimeType must be application/pdf, image/jpeg, or image/png",
        },
        { status: 400 }
      );
    }

    const storageKey = randomBytes(16).toString("hex") + "-" + Date.now();
    const payload = {
      invoiceId,
      orgId,
      storageKey,
      fileName: fileName.slice(0, 255),
      mimeType,
      sizeBytes,
      userId: user.id,
    };
    const uploadToken = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${UPLOAD_TOKEN_EXPIRY_SEC}s`)
      .sign(JWT_SECRET);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const uploadUrl = `${baseUrl}/api/orgs/${orgId}/invoices/${invoiceId}/attachments/upload`;

    return NextResponse.json({
      uploadUrl,
      storageKey,
      requiredHeaders: {
        "Content-Type": mimeType,
        "X-Upload-Token": uploadToken,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
