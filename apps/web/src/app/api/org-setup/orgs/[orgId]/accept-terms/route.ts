import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { OrgStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE } from "@/lib/get-active-org";
import { jsonResponse } from "@/lib/json-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { orgId } = await params;

    const org = await prisma.organization.findFirst({
      where: { id: orgId },
      include: {
        setupPaymentIntent: true,
        memberships: { where: { userId: user.id } },
      },
    });

    if (!org) {
      return jsonResponse({ error: "Organization not found" }, { status: 404 });
    }

    const membership = org.memberships[0];
    if (!membership) {
      return jsonResponse(
        { error: "You are not a member of this organization" },
        { status: 403 }
      );
    }

    if (org.status !== OrgStatus.PENDING_TERMS) {
      return jsonResponse(
        {
          error:
            org.status === OrgStatus.ACTIVE
              ? "Terms already accepted"
              : "Payment must be completed first",
        },
        { status: 400 }
      );
    }

    if (!org.setupPaymentIntent || org.setupPaymentIntent.status !== "PAID") {
      return jsonResponse(
        { error: "Payment must be verified first" },
        { status: 400 }
      );
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwarded?.split(",")[0]?.trim() ?? realIp ?? "unknown";
    const userAgent = request.headers.get("user-agent") ?? "unknown";

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        status: OrgStatus.ACTIVE,
        termsAcceptedAt: new Date(),
        termsAcceptedIp: ip,
        termsAcceptedUserAgent: userAgent,
      },
    });

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return jsonResponse({
      ok: true,
      redirectUrl: "/app/setup",
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
