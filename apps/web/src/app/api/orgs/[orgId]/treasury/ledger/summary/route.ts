import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { jsonResponse } from "@/lib/json-response";
import { prisma } from "@/lib/db";
import { computeLedgerSummary } from "@/lib/fiat/treasury-ledger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const entries = await prisma.treasuryLedgerEntry.findMany({
      where: { orgId },
      select: {
        account: true,
        direction: true,
        amountMinor: true,
        createdAt: true,
      },
    });

    const summary = computeLedgerSummary(entries);

    return jsonResponse({
      outstandingVendorPayable: summary.outstandingVendorPayable / 100,
      outstandingVendorPayableMinor: summary.outstandingVendorPayable,
      inFlightClearing: summary.inFlightClearing / 100,
      inFlightClearingMinor: summary.inFlightClearing,
      fees30d: summary.fees30d / 100,
      fees30dMinor: summary.fees30d,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
