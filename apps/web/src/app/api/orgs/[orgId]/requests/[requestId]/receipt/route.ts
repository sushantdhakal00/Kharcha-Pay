import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { RequestStatus } from "@prisma/client";
import { writeFile } from "fs/promises";
import { logAuditEvent } from "@/lib/audit";
import path from "path";
import { randomBytes } from "crypto";
import { getReceiptStorageDir } from "@/lib/receipt-storage";
import {
  validateReceiptFile,
  MAX_SIZE_BYTES,
  RATE_LIMIT_UPLOADS_PER_HOUR,
} from "@/lib/receipt-upload";
import { opsLog } from "@/lib/ops-log";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string; requestId: string }> }
) {
  try {
    const user = await requireUser();
    const { checkRateLimit, checkGlobalLimit } = await import("@/lib/rate-limiter");
    const g = checkGlobalLimit(request);
    if (g.limited) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: g.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(g.retryAfterSeconds) } }
      );
    }
    const r = checkRateLimit(request, "receipt:upload", user.id);
    if (r.limited) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: r.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } }
      );
    }
    await requireCsrf(request);
    const { orgId, requestId } = await params;
    await requireOrgWriteAccess(orgId, user.id);

    const existing = await prisma.expenseRequest.findFirst({
      where: { id: requestId, orgId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (existing.requesterUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.status !== RequestStatus.DRAFT) {
      return NextResponse.json({ error: "Receipt can only be added to draft requests" }, { status: 400 });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentUploads = await prisma.receiptFile.count({
      where: {
        request: { requesterUserId: user.id },
        createdAt: { gte: oneHourAgo },
      },
    });
    if (recentUploads >= RATE_LIMIT_UPLOADS_PER_HOUR) {
      return NextResponse.json(
        { error: `Upload limit reached (${RATE_LIMIT_UPLOADS_PER_HOUR} per hour). Try again later.` },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_SIZE_BYTES / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateReceiptFile(buffer);
    if (!validation.allowed) {
      opsLog.receiptUploadError(validation.error);
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const uploadDir = await getReceiptStorageDir();
    const storageKey = randomBytes(12).toString("hex") + validation.safeExt;
    const filePath = path.join(uploadDir, storageKey);
    await writeFile(filePath, buffer);

    const originalFileName = (file.name || "receipt").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
    const mimeType = file.type || "application/octet-stream";

    const receipt = await prisma.receiptFile.create({
      data: {
        requestId,
        storageKey,
        storageProvider: "LOCAL",
        fileName: originalFileName,
        mimeType,
        sizeBytes: buffer.length,
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "RECEIPT_UPLOADED",
      entityType: "ExpenseRequest",
      entityId: requestId,
      metadata: { receiptId: receipt.id, fileName: originalFileName },
    });

    const downloadUrl = `/api/receipts/${receipt.id}`;
    return NextResponse.json({
      receipt: {
        id: receipt.id,
        downloadUrl,
        fileName: receipt.fileName,
        mimeType: receipt.mimeType,
        sizeBytes: receipt.sizeBytes,
        createdAt: receipt.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    opsLog.receiptUploadError("storage_error");
    throw e;
  }
}
