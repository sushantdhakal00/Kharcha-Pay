import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import {
  getPayoutSuccessRate,
  getAverageCompletionTime,
  getFailureBreakdown,
  getPayoutVolumeSeries,
} from "@/lib/fiat/payout-metrics";

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("x-internal-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!env.INTERNAL_JOB_SECRET || secret !== env.INTERNAL_JOB_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const windowDays = parseInt(
    req.nextUrl.searchParams.get("windowDays") ?? "30",
    10
  );

  try {
    const [successRate, avgCompletion, failureBreakdown, dailyVolume] =
      await Promise.all([
        getPayoutSuccessRate(prisma, undefined, windowDays),
        getAverageCompletionTime(prisma, undefined, windowDays),
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
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
