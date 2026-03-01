import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const latest = await prisma.treasuryReconciliationCheck.findFirst({
      where: { orgId },
      orderBy: { createdAt: "desc" },
    });

    if (!latest) {
      return jsonResponse({
        hasCheck: false,
        lastCheckAt: null,
        maxSeverity: null,
        results: [],
      });
    }

    const rawResults = latest.results as Record<string, unknown>[];
    const topDrifts = Array.isArray(rawResults)
      ? rawResults
          .filter((r) => r.severity !== "INFO")
          .slice(0, 5)
      : [];

    return jsonResponse({
      hasCheck: true,
      lastCheckAt: latest.createdAt.toISOString(),
      asOf: latest.asOf.toISOString(),
      maxSeverity: latest.maxSeverity,
      totalResults: Array.isArray(rawResults) ? rawResults.length : 0,
      driftCount: topDrifts.length,
      topDrifts,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
