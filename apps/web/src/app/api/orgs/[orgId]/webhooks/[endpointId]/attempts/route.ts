/**
 * GET /api/orgs/[orgId]/webhooks/[endpointId]/attempts - Delivery log
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; endpointId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId, endpointId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const ep = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, orgId } });
    if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);
    const attempts = await prisma.webhookDeliveryAttempt.findMany({
      where: { endpointId, orgId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { outboxEvent: { select: { type: true, occurredAt: true } } },
    });

    return NextResponse.json({
      attempts: attempts.map((a) => ({
        id: a.id,
        outboxEventId: a.outboxEventId,
        eventType: a.outboxEvent.type,
        occurredAt: a.outboxEvent.occurredAt.toISOString(),
        attemptNumber: a.attemptNumber,
        status: a.status,
        responseStatus: a.responseStatus,
        errorMessage: a.errorMessage,
        createdAt: a.createdAt.toISOString(),
        completedAt: a.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
