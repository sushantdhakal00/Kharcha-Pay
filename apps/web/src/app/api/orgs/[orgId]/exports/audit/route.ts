import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { toCsv } from "@/lib/csv";
import { safeApiError } from "@/lib/safe-api-error";

/**
 * GET /api/orgs/[orgId]/exports/audit?from=&to=&action=&actorUserId=
 * Org members (including AUDITOR). Returns CSV. Compact diffs (amounts/status before->after); no huge JSON dumps.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { checkRateLimit, checkGlobalLimit } = await import("@/lib/rate-limiter");
    const g = checkGlobalLimit(request);
    if (g.limited) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: g.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(g.retryAfterSeconds) } }
      );
    }
    const r = checkRateLimit(request, "export", user.id);
    if (r.limited) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: r.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } }
      );
    }
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const action = searchParams.get("action") || undefined;
    const actorUserId = searchParams.get("actorUserId") || undefined;

    const where: { orgId: string; action?: string; actorUserId?: string; createdAt?: { gte?: Date; lte?: Date } } = { orgId };
    if (action) where.action = action;
    if (actorUserId) where.actorUserId = actorUserId;
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
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const userIds = [...new Set(events.map((e) => e.actorUserId).filter(Boolean))] as string[];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.email]));

    const rows = events.map((e) => {
      const before = e.beforeJson as Record<string, unknown> | null;
      const after = e.afterJson as Record<string, unknown> | null;
      const metadata = e.metadataJson as Record<string, unknown> | null;
      const compactDiff = buildCompactDiff(e.action, before, after);
      const summary = buildSummary(e, userMap[e.actorUserId ?? ""] ?? "System");
      const metadataStr = metadata && Object.keys(metadata).length > 0
        ? JSON.stringify(metadata).slice(0, 500)
        : "";
      return {
        time: e.createdAt.toISOString(),
        actorEmail: e.actorUserId ? userMap[e.actorUserId] ?? "" : "System",
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        summary,
        diff: compactDiff,
        metadata: metadataStr,
      };
    });

    const headers = ["time", "actorEmail", "action", "entityType", "entityId", "summary", "diff", "metadata"];
    const csv = toCsv(rows, headers);
    const filename = "audit-export.csv";

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return safeApiError(e, "Export failed");
  }
}

function buildCompactDiff(action: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  const parts: string[] = [];
  if (after?.amountMinor != null) {
    const b = before?.amountMinor;
    if (b != null && b !== after.amountMinor) parts.push(`amount: ${b}->${after.amountMinor}`);
  }
  if (after?.status != null) {
    const b = before?.status;
    if (b != null && b !== after.status) parts.push(`status: ${b}->${after.status}`);
  }
  return parts.join("; ");
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
    case "AUDIT_RETENTION_RUN": {
      const meta = (e as { metadataJson?: Record<string, unknown> }).metadataJson;
      return `${actorName}: Audit retention run (deleted: ${meta?.deletedCount ?? "—"})`;
    }
    default:
      return `${actorName}: ${e.action} on ${e.entityType} ${e.entityId}`;
  }
}
