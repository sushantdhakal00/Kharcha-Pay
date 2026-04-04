import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { opsLog } from "@/lib/ops-log";
import { getReceiptStorageDirSync } from "@/lib/receipt-storage";
import { safeApiError } from "@/lib/safe-api-error";
import path from "path";
import { existsSync } from "fs";
import { readFile } from "fs/promises";

const CACHE_CONTROL = "private, no-store";

/**
 * GET /api/receipts/[receiptId]
 * Auth required; org member read access (including AUDITOR). Serves receipt file
 * from LOCAL storage or legacy public path. Never leaks filesystem paths.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ receiptId: string }> }
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
    const r = checkRateLimit(request, "receipt:download", user.id);
    if (r.limited) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: r.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } }
      );
    }
    const { receiptId } = await params;

    const receipt = await prisma.receiptFile.findUnique({
      where: { id: receiptId },
      include: { request: { select: { orgId: true } } },
    });
    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    await requireOrgReadAccess(receipt.request.orgId, user.id);

    const mimeType = receipt.mimeType || "application/octet-stream";
    const disposition = `attachment; filename="${receipt.fileName.replace(/"/g, '\\"')}"`;
    const headers: HeadersInit = {
      "Cache-Control": CACHE_CONTROL,
      "Content-Disposition": disposition,
      "Content-Type": mimeType,
    };

    if (receipt.storageProvider === "LOCAL" && receipt.storageKey) {
      const storageDir = getReceiptStorageDirSync();
      const filePath = path.join(storageDir, receipt.storageKey);
      if (!path.resolve(filePath).startsWith(path.resolve(storageDir))) {
        return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
      }
      if (!existsSync(filePath)) {
        opsLog.receiptDownloadError("file_unavailable");
        return NextResponse.json({ error: "Receipt file unavailable" }, { status: 404 });
      }
      const buffer = await readFile(filePath);
      return new NextResponse(buffer, { status: 200, headers });
    }

    // PUBLIC_LEGACY: attempt to read from legacy public path
    if (receipt.storageProvider === "PUBLIC_LEGACY" && receipt.url) {
      const legacyPath = path.join(process.cwd(), "public", receipt.url.replace(/^\//, ""));
      const resolved = path.resolve(legacyPath);
      const publicDir = path.resolve(process.cwd(), "public");
      if (!resolved.startsWith(publicDir)) {
        return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
      }
      if (!existsSync(legacyPath)) {
        return NextResponse.json({ error: "Receipt file unavailable" }, { status: 404 });
      }
      const buffer = await readFile(legacyPath);
      return new NextResponse(buffer, { status: 200, headers });
    }

    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  } catch (e) {
    return safeApiError(e, "Receipt unavailable");
  }
}
