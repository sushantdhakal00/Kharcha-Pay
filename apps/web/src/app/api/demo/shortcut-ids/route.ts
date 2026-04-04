import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { DEMO_DETERMINISTIC_TITLES } from "@/lib/demo-seed";
import { safeApiError } from "@/lib/safe-api-error";

/**
 * GET /api/demo/shortcut-ids?orgId=...
 * Returns request IDs for Demo Shortcuts panel. Only for demo orgs.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { isDemo: true, slug: true },
    });

    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }
    if (!org.isDemo && org.slug !== "demo-org") {
      return NextResponse.json({ error: "Not a demo org" }, { status: 403 });
    }

    await requireOrgReadAccess(orgId, user.id);

    const requests = await prisma.expenseRequest.findMany({
      where: {
        orgId,
        title: {
          in: [
            DEMO_DETERMINISTIC_TITLES.DRAFT,
            DEMO_DETERMINISTIC_TITLES.PENDING,
            DEMO_DETERMINISTIC_TITLES.APPROVED,
            DEMO_DETERMINISTIC_TITLES.PAID,
          ],
        },
      },
      select: { id: true, title: true, status: true },
    });

    const byTitle = Object.fromEntries(requests.map((r) => [r.title, r.id]));

    return NextResponse.json({
      draftId: byTitle[DEMO_DETERMINISTIC_TITLES.DRAFT] ?? null,
      pendingId: byTitle[DEMO_DETERMINISTIC_TITLES.PENDING] ?? null,
      approvedId: byTitle[DEMO_DETERMINISTIC_TITLES.APPROVED] ?? null,
      paidId: byTitle[DEMO_DETERMINISTIC_TITLES.PAID] ?? null,
    });
  } catch (e) {
    return safeApiError(e, "Failed to fetch shortcut IDs");
  }
}
