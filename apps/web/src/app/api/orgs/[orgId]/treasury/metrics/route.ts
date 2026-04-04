import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import {
  getPayoutSuccessRate,
  getAverageCompletionTime,
  getFailureBreakdown,
  getPayoutVolumeSeries,
} from "@/lib/fiat/payout-metrics";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const windowDays = parseInt(
      req.nextUrl.searchParams.get("windowDays") ?? "30",
      10
    );

    const [successRate, avgCompletion, failureBreakdown, dailyVolume] =
      await Promise.all([
        getPayoutSuccessRate(prisma, orgId, windowDays),
        getAverageCompletionTime(prisma, orgId, windowDays),
        getFailureBreakdown(prisma, windowDays),
        getPayoutVolumeSeries(prisma, windowDays),
      ]);

    const totalVolumeUsd = dailyVolume.reduce((s, d) => s + d.volumeUsd, 0);

    return jsonResponse({
      successRate: successRate.successRate,
      avgCompletionMs: avgCompletion.avgMs,
      totalVolumeUsd,
      failureBreakdown,
      dailyVolumeSeries: dailyVolume,
      windowDays,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
