import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { requireRecentAuth, REAUTH_MAX_AGE_SECONDS } from "@/lib/require-recent-auth";
import { logAuditEvent } from "@/lib/audit";
import { seedDemoOrg, DEMO_SEED_VERSION } from "@/lib/demo-seed";
import { canResetDemo, recordDemoReset } from "@/lib/demo-rate-limit";
import { safeApiError } from "@/lib/safe-api-error";

/**
 * POST /api/demo/reset
 * Only for the current user's demo org. Deletes demo org data and reseeds.
 * Requires reauth. Rate limited to once per minute per user.
 */
export async function POST(request: Request) {
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
    const r = checkRateLimit(request, "demo:reset", user.id);
    if (r.limited) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: r.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } }
      );
    }
    await requireCsrf(request);
    await requireRecentAuth(REAUTH_MAX_AGE_SECONDS);

    if (!canResetDemo(user.id)) {
      return NextResponse.json(
        { error: "Demo reset is rate limited. Wait 1 minute before trying again.", code: "RATE_LIMITED", retryAfterSeconds: 60 },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const demoOrg = await prisma.organization.findFirst({
      where: {
        isDemo: true,
        demoOwnerUserId: user.id,
      },
    });

    if (!demoOrg) {
      return NextResponse.json(
        { error: "No demo org found. Start demo first." },
        { status: 404 }
      );
    }

    const orgId = demoOrg.id;

    await prisma.$transaction([
      prisma.paymentReconciliation.deleteMany({ where: { orgId } }),
      prisma.receiptFile.deleteMany({ where: { request: { orgId } } }),
      prisma.approvalAction.deleteMany({ where: { request: { orgId } } }),
      prisma.expenseRequest.deleteMany({ where: { orgId } }),
      prisma.monthlyBudget.deleteMany({ where: { orgId } }),
      prisma.department.deleteMany({ where: { orgId } }),
      prisma.vendor.deleteMany({ where: { orgId } }),
      prisma.auditEvent.deleteMany({ where: { orgId } }),
      prisma.notification.deleteMany({ where: { orgId } }),
      prisma.orgSpendPolicy.deleteMany({ where: { orgId } }),
      prisma.approvalTier.deleteMany({ where: { policy: { orgId } } }),
      prisma.approvalPolicy.deleteMany({ where: { orgId } }),
      prisma.orgChainConfig.deleteMany({ where: { orgId } }),
      prisma.orgAuditRetention.deleteMany({ where: { orgId } }),
    ]);

    await seedDemoOrg({
      orgId,
      demoOwnerUserId: user.id,
      actorUserId: user.id,
    });

    recordDemoReset(user.id);

    const counts = await prisma.expenseRequest.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { id: true },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "DEMO_RESET",
      entityType: "Organization",
      entityId: orgId,
      metadata: {
        seedVersion: DEMO_SEED_VERSION,
        requestCounts: Object.fromEntries(counts.map((c) => [c.status, c._count.id])),
      },
    });

    return NextResponse.json({ demoOrgId: orgId, reset: true });
  } catch (e) {
    return safeApiError(e, "Demo reset failed");
  }
}
