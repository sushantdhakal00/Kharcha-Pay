import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { RequestStatus } from "@prisma/client";
import { bigIntToString } from "@/lib/bigint";
import { buildRequestMemo } from "@/lib/solana/payments";

const cluster = process.env.SOLANA_CLUSTER ?? "devnet";

/**
 * GET /api/orgs/[orgId]/payments?from=&to=&departmentId=&vendorId=
 * Returns PAID requests for the payments ledger. Any org member (including AUDITOR).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const departmentId = searchParams.get("departmentId") || undefined;
    const vendorId = searchParams.get("vendorId") || undefined;
    const verificationStatus = searchParams.get("verificationStatus") || undefined;

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
    const slug = org?.slug;

    const requests = await prisma.expenseRequest.findMany({
      where: {
        orgId,
        status: RequestStatus.PAID,
        ...(Object.keys(paidAtFilter).length > 0 && { paidAt: paidAtFilter }),
        ...(departmentId && { departmentId }),
        ...(vendorId && { vendorId }),
      },
      include: {
        department: { select: { name: true } },
        vendor: { select: { name: true } },
      },
      orderBy: { paidAt: "desc" },
    });

    const requestIds = requests.map((r) => r.id);
    const reconciliations = requestIds.length > 0
      ? await prisma.paymentReconciliation.findMany({
          where: { requestId: { in: requestIds } },
        })
      : [];
    const reconByRequest = Object.fromEntries(reconciliations.map((r) => [r.requestId, r]));

    let filtered = requests;
    if (verificationStatus) {
      if (verificationStatus === "PENDING") {
        filtered = requests.filter((r) => !reconByRequest[r.id]);
      } else {
        filtered = requests.filter((r) => reconByRequest[r.id]?.status === verificationStatus);
      }
    }

    const payments = filtered.map((r) => {
      const recon = reconByRequest[r.id];
      const memo = buildRequestMemo(r.id, slug);
      const explorerLink = r.paidTxSig
        ? `https://explorer.solana.com/tx/${r.paidTxSig}?cluster=${cluster}`
        : null;
      return {
        id: r.id,
        paidAt: r.paidAt?.toISOString() ?? null,
        vendorName: r.vendor.name,
        departmentName: r.department.name,
        amountMinor: bigIntToString(r.amountMinor),
        currency: r.currency,
        paidTxSig: r.paidTxSig ?? null,
        memo,
        explorerLink,
        verificationStatus: recon?.status ?? "PENDING",
        verificationCheckedAt: recon?.checkedAt?.toISOString() ?? null,
        verificationReasons: (recon?.detailsJson as { reasons?: string[] } | null)?.reasons ?? [],
      };
    });

    return NextResponse.json({ payments });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
