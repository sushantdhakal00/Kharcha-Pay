/**
 * POST /api/cron/webhook-process
 * Processes pending OutboxEvents and delivers to webhook endpoints.
 * Secured by CRON_SECRET (required in prod).
 */
import { NextRequest, NextResponse } from "next/server";
import { processWebhookDelivery } from "@/lib/webhook-worker";
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
    const result = await processWebhookDelivery();
    await prisma.cronRun.upsert({
      where: { cronType: "webhook-process" },
      create: { cronType: "webhook-process", lastRunAt: new Date(), lastResult: result },
      update: { lastRunAt: new Date(), lastResult: result },
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[webhook-process]", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
