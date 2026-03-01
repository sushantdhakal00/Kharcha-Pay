import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { RequestStatus } from "@prisma/client";
import { toCsv } from "@/lib/csv";
import { buildRequestMemo } from "@/lib/solana/payments";
import { safeApiError } from "@/lib/safe-api-error";

/**
 * GET /api/orgs/[orgId]/exports/requests?from=&to=&status=&departmentId=&vendorId=&mine=1
 * Any org member. Returns CSV.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
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
    const r = checkRateLimit(request, "export", user.id);
    if (r.limited) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: r.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } }
      );
    }
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const status = searchParams.get("status") as RequestStatus | null;
    const departmentId = searchParams.get("departmentId") || undefined;
    const vendorId = searchParams.get("vendorId") || undefined;
    const mine = searchParams.get("mine") === "1";

    const where: { orgId: string; requesterUserId?: string; status?: RequestStatus; departmentId?: string; vendorId?: string; createdAt?: { gte?: Date; lte?: Date } } = { orgId };
    if (mine) where.requesterUserId = user.id;
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (vendorId) where.vendorId = vendorId;
    if (fromStr || toStr) {
      where.createdAt = {};
      if (fromStr) {
        const from = new Date(fromStr);
        if (!isNaN(from.getTime())) where.createdAt.gte = from;
      }
      if (toStr) {
        const to = new Date(toStr);
        if (!isNaN(to.getTime())) where.createdAt.lte = to;
      }
      if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    });

    const requests = await prisma.expenseRequest.findMany({
      where,
      include: {
        department: { select: { name: true } },
        vendor: { select: { name: true } },
        approvalActions: { where: { decision: "APPROVE" }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = requests.map((r) => {
      const approvalsReceived = r.approvalActions.length;
      const memo = buildRequestMemo(r.id, org?.slug ?? undefined);
      return {
        requestId: r.id,
        createdAt: r.createdAt.toISOString(),
        submittedAt: r.submittedAt?.toISOString() ?? "",
        department: r.department.name,
        vendor: r.vendor.name,
        title: r.title,
        category: r.category,
        amountMinor: r.amountMinor.toString(),
        currency: r.currency,
        status: r.status,
        approvalsReceived: String(approvalsReceived),
        requiredApprovals: String(r.requiredApprovals),
        paidAt: r.paidAt?.toISOString() ?? "",
        paidTxSig: r.paidTxSig ?? "",
        memo,
      };
    });

    const headers = ["requestId", "createdAt", "submittedAt", "department", "vendor", "title", "category", "amountMinor", "currency", "status", "approvalsReceived", "requiredApprovals", "paidAt", "paidTxSig", "memo"];
    const csv = toCsv(rows, headers);
    const filename = "requests-export.csv";

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return safeApiError(e, "Export failed");
  }
}
