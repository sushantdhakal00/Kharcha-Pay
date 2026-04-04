/**
 * GET /api/demo/readiness
 * No auth required. Returns ok=true only when demo+internal mode and DB/shortcut checks pass.
 * For Replit deploy sanity before recording.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { DEMO_DETERMINISTIC_TITLES } from "@/lib/demo-seed";

const isInternalMode = () =>
  process.env.NEXT_PUBLIC_INTERNAL_MODE === "1" || process.env.NEXT_PUBLIC_INTERNAL_MODE === "true";
const isDemoMode = () => env.DEMO_MODE === "1" || env.DEMO_MODE === "true";

export async function GET() {
  const internalMode = isInternalMode();
  const demoMode = isDemoMode();

  if (!internalMode || !demoMode) {
    return NextResponse.json({
      ok: false,
      checks: {
        db: "skipped",
        demoMode: demoMode ? "ok" : "off",
        internalMode: internalMode ? "ok" : "off",
        demoOrg: "skipped",
        shortcutIds: "skipped",
      },
      message: "Demo readiness requires NEXT_PUBLIC_INTERNAL_MODE=1 and DEMO_MODE=1",
    });
  }

  const checks: Record<string, string> = {
    demoMode: "ok",
    internalMode: "ok",
  };

  let dbOk = false;
  let demoOrgOk = false;
  let shortcutIdsOk = false;

  try {
    const org = await prisma.organization.findFirst({
      where: { OR: [{ isDemo: true }, { slug: "demo-org" }] },
      select: { id: true },
    });
    dbOk = true;
    demoOrgOk = !!org;

    if (org) {
      const requests = await prisma.expenseRequest.findMany({
        where: {
          orgId: org.id,
          title: {
            in: [
              DEMO_DETERMINISTIC_TITLES.DRAFT,
              DEMO_DETERMINISTIC_TITLES.PENDING,
              DEMO_DETERMINISTIC_TITLES.APPROVED,
              DEMO_DETERMINISTIC_TITLES.PAID,
            ],
          },
        },
        select: { id: true, title: true },
      });
      const byTitle = Object.fromEntries(requests.map((r) => [r.title, r.id]));
      shortcutIdsOk =
        !!byTitle[DEMO_DETERMINISTIC_TITLES.DRAFT] &&
        !!byTitle[DEMO_DETERMINISTIC_TITLES.PENDING] &&
        !!byTitle[DEMO_DETERMINISTIC_TITLES.APPROVED] &&
        !!byTitle[DEMO_DETERMINISTIC_TITLES.PAID];
    }
  } catch {
    dbOk = false;
  }

  checks.db = dbOk ? "ok" : "fail";
  checks.demoOrg = demoOrgOk ? "ok" : "fail";
  checks.shortcutIds = shortcutIdsOk ? "ok" : "fail";

  const ok = dbOk && demoOrgOk && shortcutIdsOk;

  return NextResponse.json({
    ok,
    checks,
  });
}
