/**
 * GET /api/orgs/[orgId]/webhooks/observability
 * Outbox lag, dead letters, last 24h success rate (ADMIN)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const pending = await prisma.outboxEvent.findMany({
      where: { orgId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 1,
    });
    const pendingCount = await prisma.outboxEvent.count({
      where: { orgId, status: "PENDING" },
    });
    const oldestPending = pending[0]?.createdAt ?? null;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const attempts = await prisma.webhookDeliveryAttempt.findMany({
      where: { orgId, createdAt: { gte: since } },
      select: { status: true },
    });
    const success = attempts.filter((a) => a.status === "SUCCESS").length;
    const dead = attempts.filter((a) => a.status === "DEAD").length;
    const total = attempts.length;
    const successRate = total > 0 ? Math.round((success / total) * 100) : 100;

    return NextResponse.json({
      pendingCount,
      oldestPendingAt: oldestPending?.toISOString() ?? null,
      deadLettersLast24h: dead,
      successRateLast24h: successRate,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
