import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { requireRecentAuth, REAUTH_MAX_AGE_SECONDS } from "@/lib/require-recent-auth";
import { OrgRole } from "@prisma/client";
import { runReconciliationForOrg } from "@/lib/reconcile";
import { safeApiError } from "@/lib/safe-api-error";

/**
 * POST /api/orgs/[orgId]/reconcile/run
 * ADMIN only; step-up reauth required.
 * Reconciles last N paid requests (default 50, max 50).
 * Query: limit (optional)
 */
export async function POST(
  request: Request,
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
    const r = checkRateLimit(request, "reconcile:run", user.id);
    if (r.limited) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: r.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } }
      );
    }
    await requireCsrf(request);
    await requireRecentAuth(REAUTH_MAX_AGE_SECONDS);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 50);

    const result = await runReconciliationForOrg(orgId, {
      limit,
      actorUserId: user.id,
    });

    return NextResponse.json(result);
  } catch (e) {
    return safeApiError(e, "Reconciliation failed");
  }
}
