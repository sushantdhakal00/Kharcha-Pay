/**
 * POST /api/orgs/[orgId]/webhooks/replay
 * Body: { outboxEventId, endpointId }
 * Re-enqueues an OutboxEvent for delivery to an endpoint (resets to PENDING, worker will pick up).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { OrgRole } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await req.json().catch(() => ({}));
    const outboxEventId = String(body.outboxEventId ?? "").trim();
    const endpointId = String(body.endpointId ?? "").trim();

    if (!outboxEventId || !endpointId) {
      return NextResponse.json(
        { error: "outboxEventId and endpointId required" },
        { status: 400 }
      );
    }

    const [event, endpoint] = await Promise.all([
      prisma.outboxEvent.findFirst({ where: { id: outboxEventId, orgId } }),
      prisma.webhookEndpoint.findFirst({ where: { id: endpointId, orgId } }),
    ]);

    if (!event || !endpoint) {
      return NextResponse.json({ error: "Event or endpoint not found" }, { status: 404 });
    }
    if (endpoint.status !== "ACTIVE") {
      return NextResponse.json({ error: "Endpoint is disabled" }, { status: 400 });
    }

    await prisma.outboxEvent.update({
      where: { id: outboxEventId },
      data: { status: "PENDING" },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "WEBHOOK_REPLAY_TRIGGERED",
      entityType: "OutboxEvent",
      entityId: outboxEventId,
      metadata: { endpointId },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
