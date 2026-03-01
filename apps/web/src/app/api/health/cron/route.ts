/**
 * GET /api/health/cron
 * Last cron run timestamps and backlog. Requires HEALTH_ADMIN_TOKEN when set.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireHealthAdmin } from "@/lib/health-auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const err = requireHealthAdmin(req);
  if (err) return err;

  try {
    const cronRuns = await prisma.cronRun.findMany({
      orderBy: { lastRunAt: "desc" },
    });

    const [outboxBacklog, webhookDead, syncPending] = await Promise.all([
      prisma.outboxEvent.count({ where: { status: "PENDING" } }),
      prisma.webhookDeliveryAttempt.count({ where: { status: "DEAD" } }),
      prisma.accountingSyncJob.count({ where: { status: "PENDING" } }),
    ]);

    const byType = Object.fromEntries(
      cronRuns.map((r) => [
        r.cronType,
        {
          lastRunAt: r.lastRunAt.toISOString(),
          lastResult: r.lastResult as Record<string, unknown> | null,
        },
      ])
    );

    return NextResponse.json({
      ok: true,
      cron: byType,
      backlog: {
        outboxPending: outboxBacklog,
        webhookDeadLetters: webhookDead,
        accountingSyncPending: syncPending,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 503 }
    );
  }
}
