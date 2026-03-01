import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE } from "@/lib/get-active-org";

/**
 * POST /api/me/active-org { orgId }
 * Sets the active org cookie. User must be a member of the org.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireCsrf(request);

    const body = await request.json().catch(() => ({}));
    const orgId = typeof body.orgId === "string" ? body.orgId.trim() : null;
    if (!orgId) {
      return NextResponse.json(
        { error: "orgId is required" },
        { status: 400 }
      );
    }

    const membership = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member of this org" }, { status: 403 });
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.json({ ok: true, orgId });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
