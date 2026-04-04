/**
 * POST /api/cron/qbo-cdc-sync
 * Daily CDC backfill for QBO. Enqueues QBO_CDC_SYNC for each connected org.
 * Secured by CRON_SECRET (required in prod).
 */
import { NextRequest, NextResponse } from "next/server";
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
    const conns = await prisma.accountingConnection.findMany({
      where: { provider: "QUICKBOOKS_ONLINE", status: "CONNECTED" },
    });
    let enqueued = 0;
    for (const c of conns) {
      await prisma.accountingSyncJob.create({
        data: {
          orgId: c.orgId,
          provider: "QUICKBOOKS_ONLINE",
          type: "QBO_CDC_SYNC",
          status: "PENDING",
        },
      });
      enqueued++;
    }
    await prisma.cronRun.upsert({
      where: { cronType: "qbo-cdc-sync" },
      create: { cronType: "qbo-cdc-sync", lastRunAt: new Date(), lastResult: { enqueued } },
      update: { lastRunAt: new Date(), lastResult: { enqueued } },
    });
    return NextResponse.json({ enqueued });
  } catch (e) {
    console.error("[qbo-cdc-sync]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
