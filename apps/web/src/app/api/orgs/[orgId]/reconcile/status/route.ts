import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";

/**
 * GET /api/orgs/[orgId]/reconcile/status?requestId=...
 * Any org member (including AUDITOR). Returns verification status for a paid request.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const requestId = request.nextUrl.searchParams.get("requestId");
    if (!requestId) {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }

    const expenseRequest = await prisma.expenseRequest.findFirst({
      where: { id: requestId, orgId },
      select: { id: true, status: true },
    });

    if (!expenseRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (expenseRequest.status !== "PAID") {
      return NextResponse.json({
        requestId,
        status: "NOT_APPLICABLE",
        message: "Request is not paid",
      });
    }

    const recon = await prisma.paymentReconciliation.findUnique({
      where: { requestId },
    });

    if (!recon) {
      return NextResponse.json({
        requestId,
        status: "PENDING",
        message: "Not yet verified",
      });
    }

    const details = recon.detailsJson as { reasons?: string[]; observed?: unknown; expected?: unknown } | null;

    return NextResponse.json({
      requestId,
      status: recon.status,
      checkedAt: recon.checkedAt.toISOString(),
      reasons: details?.reasons ?? [],
      observed: details?.observed,
      expected: details?.expected,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
