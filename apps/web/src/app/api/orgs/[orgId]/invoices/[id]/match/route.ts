import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { jsonResponse } from "@/lib/json-response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, id } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const inv = await prisma.invoice.findFirst({
      where: { id, orgId },
    });
    if (!inv) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const match = await prisma.matchResult.findUnique({
      where: { invoiceId: id },
    });
    if (!match) {
      return NextResponse.json({ matchResult: null });
    }

    return jsonResponse({
      matchResult: {
        id: match.id,
        invoiceId: match.invoiceId,
        poId: match.poId,
        grnId: match.grnId,
        matchType: match.matchType,
        status: match.status,
        diffsJson: match.diffsJson,
        toleranceAppliedJson: match.toleranceAppliedJson,
        computedAt: match.computedAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
