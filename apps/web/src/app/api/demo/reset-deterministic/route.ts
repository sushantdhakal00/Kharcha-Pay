import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { requireRecentAuth, REAUTH_MAX_AGE_SECONDS } from "@/lib/require-recent-auth";
import { logAuditEvent } from "@/lib/audit";
import { seedDemoOrgDeterministic } from "@/lib/demo-seed";
import { canResetDemo, recordDemoReset } from "@/lib/demo-rate-limit";
import { safeApiError } from "@/lib/safe-api-error";

const isDemoMode = () =>
  process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1";
const isInternalMode = () =>
  process.env.NEXT_PUBLIC_INTERNAL_MODE === "1" ||
  process.env.NEXT_PUBLIC_INTERNAL_MODE === "true";

/**
 * POST /api/demo/reset-deterministic
 * Resets demo org to a known-good 4-request pipeline. ADMIN only.
 * Safe: refuses in production unless DEMO_MODE and INTERNAL_MODE.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();

    if (process.env.NODE_ENV === "production") {
      if (!isDemoMode() || !isInternalMode()) {
        return NextResponse.json(
          { error: "Deterministic demo reset is disabled in production.", code: "FORBIDDEN" },
          { status: 403 }
        );
      }
    }

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
        {
          error: "Demo reset is rate limited. Wait 1 minute before trying again.",
          code: "RATE_LIMITED",
          retryAfterSeconds: 60,
        },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const demoOrg = await prisma.organization.findFirst({
      where: {
        OR: [{ isDemo: true, demoOwnerUserId: user.id }, { slug: "demo-org" }],
      },
    });

    if (!demoOrg) {
      return NextResponse.json(
        { error: "No demo org found. Start demo first." },
        { status: 404 }
      );
    }

    if (demoOrg.isDemo && demoOrg.demoOwnerUserId !== user.id) {
      return NextResponse.json(
        { error: "Demo reset allowed only for your own demo org." },
        { status: 403 }
      );
    }

    await requireOrgRole(demoOrg.id, user.id, ["ADMIN"]);

    const result = await seedDemoOrgDeterministic({
      orgId: demoOrg.id,
      demoOwnerUserId: demoOrg.demoOwnerUserId ?? user.id,
      actorUserId: user.id,
    });

    recordDemoReset(user.id);

    await logAuditEvent({
      orgId: demoOrg.id,
      actorUserId: user.id,
      action: "DEMO_RESET",
      entityType: "Organization",
      entityId: demoOrg.id,
      metadata: { deterministic: true, requestIds: result },
    });

    return NextResponse.json({
      demoOrgId: demoOrg.id,
      reset: true,
      requestIds: result,
    });
  } catch (e) {
    return safeApiError(e, "Deterministic demo reset failed");
  }
}
