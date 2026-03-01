/**
 * POST /api/cron/accounting-sync
 * Processes PENDING AccountingSyncJobs. Secured by CRON_SECRET (required in prod).
 */
import { NextRequest, NextResponse } from "next/server";
import { processAccountingSyncJobs } from "@/lib/accounting/sync-worker";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.headers.get("x-cron-secret");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : secret;
  if (env.CRON_SECRET && token !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processAccountingSyncJobs();
    await prisma.cronRun.upsert({
      where: { cronType: "accounting-sync" },
      create: { cronType: "accounting-sync", lastRunAt: new Date(), lastResult: result },
      update: { lastRunAt: new Date(), lastResult: result },
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[accounting-sync]", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
