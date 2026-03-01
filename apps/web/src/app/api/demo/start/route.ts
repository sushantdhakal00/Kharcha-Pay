import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";
import { seedDemoOrg, DEMO_SEED_VERSION } from "@/lib/demo-seed";
import { safeApiError } from "@/lib/safe-api-error";

/**
 * POST /api/demo/start
 * Creates demo org if missing for current user, otherwise reuses it.
 * Seeds data if empty or if demoSeedVersion changed.
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
    const r = checkRateLimit(request, "demo:start", user.id);
    if (r.limited) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: r.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } }
      );
    }
    await requireCsrf(request);

    let demoOrg = await prisma.organization.findFirst({
      where: {
        isDemo: true,
        demoOwnerUserId: user.id,
      },
      include: {
        memberships: { where: { userId: user.id } },
        _count: { select: { requests: true } },
      },
    });

    const slugBase = `demo-${user.id.slice(0, 8)}`;
    let slug = slugBase;
    let suffix = 0;
    while (
      await prisma.organization.findUnique({
        where: { slug },
      })
    ) {
      if (demoOrg && demoOrg.slug === slug) break;
      suffix++;
      slug = `${slugBase}-${suffix}`;
    }

    if (!demoOrg) {
      demoOrg = await prisma.organization.create({
        data: {
          name: `Demo Workspace (${user.username})`,
          slug,
          isDemo: true,
          demoOwnerUserId: user.id,
          demoSeedVersion: DEMO_SEED_VERSION,
          memberships: {
            create: { userId: user.id, role: OrgRole.ADMIN },
          },
        },
        include: {
          memberships: true,
          _count: { select: { requests: true } },
        },
      });

      await logAuditEvent({
        orgId: demoOrg.id,
        actorUserId: user.id,
        action: "DEMO_STARTED",
        entityType: "Organization",
        entityId: demoOrg.id,
        metadata: { seedVersion: DEMO_SEED_VERSION },
      });

      await seedDemoOrg({
        orgId: demoOrg.id,
        demoOwnerUserId: user.id,
        actorUserId: user.id,
      });
    } else {
      const needsReseed =
        demoOrg._count.requests === 0 ||
        (demoOrg.demoSeedVersion !== undefined && demoOrg.demoSeedVersion !== DEMO_SEED_VERSION);

      if (needsReseed) {
        if (demoOrg.demoSeedVersion !== DEMO_SEED_VERSION) {
          await prisma.organization.update({
            where: { id: demoOrg.id },
            data: { demoSeedVersion: DEMO_SEED_VERSION },
          });
        }
        await seedDemoOrg({
          orgId: demoOrg.id,
          demoOwnerUserId: user.id,
          actorUserId: user.id,
          forceReseed: demoOrg._count.requests > 0,
        });
      }
    }

    return NextResponse.json({ demoOrgId: demoOrg.id });
  } catch (e) {
    return safeApiError(e, "Demo start failed");
  }
}
