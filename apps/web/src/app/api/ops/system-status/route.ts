/**
 * GET /api/ops/system-status?orgId=xxx
 * Admin only. Returns DB, Redis, Cron, Outbox, Webhook, QBO metrics for System Status page.
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";
import { env } from "@/lib/env";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      // leave false
    }

    let redisOk: boolean | "skipped" = "skipped";
    if (env.REDIS_URL) {
      const client = getRedisClient();
      try {
        if (client) {
          await client.ping();
          redisOk = true;
        } else {
          redisOk = false;
        }
      } catch {
        redisOk = false;
      }
    }

    const [cronRuns, outboxPending, webhookDead, webhook24h, qboLastSuccess, syncBlocked] = await Promise.all([
      prisma.cronRun.findMany({ orderBy: { lastRunAt: "desc" } }),
      prisma.outboxEvent.count({ where: { status: "PENDING" } }),
      prisma.webhookDeliveryAttempt.count({ where: { status: "DEAD" } }),
      prisma.webhookDeliveryAttempt
        .groupBy({
          by: ["status"],
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          _count: true,
        })
        .catch(() => []),
      prisma.accountingSyncJob.findFirst({
        where: { status: "SUCCESS" },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      }),
      prisma.accountingSyncJob.count({
        where: { status: "FAILED", errorMessage: { contains: "refresh", mode: "insensitive" } },
      }),
    ]);

    const webhook24hSuccess = webhook24h.find((g) => g.status === "SUCCESS")?._count ?? 0;
    const webhook24hTotal =
      webhook24h.reduce((s, g) => s + g._count, 0) || 1;
    const webhookSuccessRate24h =
      Math.round((webhook24hSuccess / webhook24hTotal) * 100);

    const cronByType = Object.fromEntries(
      cronRuns.map((r) => [
        r.cronType,
        {
          lastRunAt: r.lastRunAt.toISOString(),
          lastResult: r.lastResult as Record<string, unknown> | null,
        },
      ])
    );

    return NextResponse.json({
      db: { ok: dbOk },
      redis: { ok: redisOk },
      cron: cronByType,
      outbox: { pending: outboxPending },
      webhook: {
        deadLetters: webhookDead,
        successRate24h: webhookSuccessRate24h,
        total24h: webhook24hTotal,
      },
      qbo: {
        lastSuccessAt: qboLastSuccess?.finishedAt?.toISOString() ?? null,
        blockedExportsCount: syncBlocked,
      },
      sse: { activeConnections: "N/A" },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
