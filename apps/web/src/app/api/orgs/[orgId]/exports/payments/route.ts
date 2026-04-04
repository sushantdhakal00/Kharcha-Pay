import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { RequestStatus } from "@prisma/client";
import { toCsv } from "@/lib/csv";
import { buildRequestMemo } from "@/lib/solana/payments";
import { safeApiError } from "@/lib/safe-api-error";

const cluster = process.env.SOLANA_CLUSTER ?? "devnet";

/**
 * GET /api/orgs/[orgId]/exports/payments?from=&to=
 * Any org member. Returns CSV of PAID requests only.
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

    const paidAtFilter: { gte?: Date; lte?: Date } = {};
    if (fromStr) {
      const from = new Date(fromStr);
      if (!isNaN(from.getTime())) paidAtFilter.gte = from;
    }
    if (toStr) {
      const to = new Date(toStr);
      if (!isNaN(to.getTime())) paidAtFilter.lte = to;
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    });

    const requests = await prisma.expenseRequest.findMany({
      where: {
        orgId,
        status: RequestStatus.PAID,
        ...(Object.keys(paidAtFilter).length > 0 && { paidAt: paidAtFilter }),
      },
      include: {
        department: { select: { name: true } },
        vendor: { select: { name: true } },
      },
      orderBy: { paidAt: "desc" },
    });

    const requestIds = requests.map((r) => r.id);
    const reconciliations = requestIds.length > 0
      ? await prisma.paymentReconciliation.findMany({ where: { requestId: { in: requestIds } } })
      : [];
    const reconByRequest = Object.fromEntries(reconciliations.map((r) => [r.requestId, r]));

    const rows = requests.map((r) => {
      const recon = reconByRequest[r.id];
      const memo = buildRequestMemo(r.id, org?.slug ?? undefined);
      const explorerLink = r.paidTxSig
        ? `https://explorer.solana.com/tx/${r.paidTxSig}?cluster=${cluster}`
        : "";
      return {
        requestId: r.id,
        vendor: r.vendor.name,
        department: r.department.name,
        amountMinor: r.amountMinor.toString(),
        currency: r.currency,
        paidAt: r.paidAt?.toISOString() ?? "",
        paidTxSig: r.paidTxSig ?? "",
        paidToTokenAccount: r.paidToTokenAccount ?? "",
        memo,
        explorerLink,
        verificationStatus: recon?.status ?? "PENDING",
        verificationCheckedAt: recon?.checkedAt?.toISOString() ?? "",
      };
    });

    const headers = ["requestId", "vendor", "department", "amountMinor", "currency", "paidAt", "paidTxSig", "paidToTokenAccount", "memo", "explorerLink", "verificationStatus", "verificationCheckedAt"];
    const csv = toCsv(rows, headers);
    const filename = "payments-export.csv";

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
