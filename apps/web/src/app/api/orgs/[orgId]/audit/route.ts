import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { jsonResponse } from "@/lib/json-response";

/**
 * GET /api/orgs/[orgId]/audit
 * Only org members can view. Append-only; no delete/edit endpoints.
 * Query: entityType, entityId, actorUserId, action, from, to, limit, cursor
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType") ?? undefined;
    const entityId = searchParams.get("entityId") ?? undefined;
    const actorUserId = searchParams.get("actorUserId") ?? undefined;
    const action = searchParams.get("action") ?? undefined;
    const fromStr = searchParams.get("from") ?? undefined;
    const toStr = searchParams.get("to") ?? undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
    const cursor = searchParams.get("cursor") ?? undefined;

    const where: { orgId: string; entityType?: string; entityId?: string; actorUserId?: string; action?: string; createdAt?: { gte?: Date; lte?: Date } } = { orgId };
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (actorUserId) where.actorUserId = actorUserId;
    if (action) where.action = action;
    if (fromStr || toStr) {
      where.createdAt = {};
      if (fromStr) {
        const from = new Date(fromStr);
        if (!isNaN(from.getTime())) where.createdAt.gte = from;
      }
      if (toStr) {
        const to = new Date(toStr);
        if (!isNaN(to.getTime())) where.createdAt.lte = to;
      }
      if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
    }

    const events = await prisma.auditEvent.findMany({
      where,
      include: { org: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    const actorIds = items.map((e) => e.actorUserId).filter((id): id is string => !!id);
    const users = actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...new Set(actorIds)] } },
          select: { id: true, username: true },
        })
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.username]));

    return jsonResponse({
      events: items.map((e) => ({
        id: e.id,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        actorUserId: e.actorUserId,
        actorUsername: e.actorUserId ? userMap[e.actorUserId] ?? null : null,
        beforeJson: e.beforeJson,
        afterJson: e.afterJson,
        metadataJson: e.metadataJson,
        createdAt: e.createdAt.toISOString(),
        summary: buildSummary(e, userMap[e.actorUserId ?? ""] ?? "System"),
      })),
      nextCursor,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

function buildSummary(
  e: { action: string; entityType: string; entityId: string; afterJson: unknown; beforeJson: unknown },
  actorName: string
): string {
  const a = e.afterJson as Record<string, unknown> | null;
  switch (e.action) {
    case "ORG_CREATED":
      return `${actorName}: Organization created`;
    case "MEMBER_ADDED":
      return `${actorName}: Member added`;
    case "DEPT_CREATED":
      return `${actorName}: Department created`;
    case "BUDGET_UPSERTED":
      return `${actorName}: Budget set to ${a?.amountMinor ?? "—"} (${a?.year ?? ""}/${a?.month ?? ""})`;
    case "REQUEST_CREATED":
      return `${actorName}: Request created`;
    case "REQUEST_UPDATED":
      return `${actorName}: Request updated`;
    case "RECEIPT_UPLOADED":
      return `${actorName}: Receipt uploaded`;
    case "REQUEST_SUBMITTED":
      return `${actorName}: Request submitted`;
    case "REQUEST_APPROVED":
      return `${actorName}: Request approved`;
    case "REQUEST_REJECTED":
      return `${actorName}: Request rejected`;
    case "VENDOR_CREATED":
      return `${actorName}: Vendor created`;
    case "VENDOR_WALLET_SET":
      return `${actorName}: Vendor wallet set`;
    case "REQUEST_PAID":
      return `${actorName}: Request paid (tx: ${(a?.paidTxSig as string)?.slice(0, 8) ?? "—"}…)`;
    case "SPEND_POLICY_UPDATED":
      return `${actorName}: Spend policy updated`;
    case "PAYMENT_BLOCKED":
      return `${actorName}: Payment blocked (policy)`;
    case "RECONCILIATION_RUN_STARTED":
      return `${actorName}: Reconciliation run started`;
    case "RECONCILIATION_RUN_FINISHED":
      return `${actorName}: Reconciliation run finished`;
    case "PAYMENT_VERIFIED":
      return `${actorName}: Payment verified (${e.entityId})`;
    case "PAYMENT_VERIFICATION_FAILED":
      return `${actorName}: Payment verification failed (${e.entityId})`;
    default:
      return `${actorName}: ${e.action} on ${e.entityType} ${e.entityId}`;
  }
}
