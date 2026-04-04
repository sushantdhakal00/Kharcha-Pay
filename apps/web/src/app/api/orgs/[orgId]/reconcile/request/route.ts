import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { requireRecentAuth, REAUTH_MAX_AGE_SECONDS } from "@/lib/require-recent-auth";
import { OrgRole } from "@prisma/client";
import { verifySingleRequest } from "@/lib/reconcile";

/**
 * POST /api/orgs/[orgId]/reconcile/request
 * ADMIN only (or AUDITOR if read-only trigger is acceptable — spec says admin only).
 * Reconcile a single request.
 * Body: { requestId: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    await requireRecentAuth(REAUTH_MAX_AGE_SECONDS);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await request.json().catch(() => ({}));
    const requestId = body.requestId ?? (body as { requestId?: string }).requestId;
    if (!requestId || typeof requestId !== "string") {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }

    const result = await verifySingleRequest(orgId, requestId, user.id);
    if (!result) {
      return NextResponse.json({ error: "Request not found or not PAID" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
