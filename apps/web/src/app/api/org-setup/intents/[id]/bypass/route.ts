import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { jsonResponse } from "@/lib/json-response";
import { env } from "@/lib/env";
import { OrgStatus } from "@prisma/client";
import { OrgSetupPaymentIntentStatus } from "@prisma/client";

/**
 * Bypass payment for org setup. Only available in development or when DEMO_MODE is true.
 * Marks the intent as PAID and org as PENDING_TERMS so user can continue to terms acceptance.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isDev = env.NODE_ENV !== "production";
    const isDemo = env.DEMO_MODE === "true" || env.DEMO_MODE === "1";
    if (!isDev && !isDemo) {
      return jsonResponse({ error: "Bypass only available in development or demo mode" }, { status: 403 });
    }

    const user = await requireUser();
    await requireCsrf(request);
    const { id } = await params;

    const intent = await prisma.orgSetupPaymentIntent.findFirst({
      where: { id, userId: user.id },
    });

    if (!intent) {
      return jsonResponse({ error: "Intent not found" }, { status: 404 });
    }

    if (intent.status === OrgSetupPaymentIntentStatus.PAID) {
      return jsonResponse({
        status: "PAID",
        organizationId: intent.organizationId,
      });
    }

    await prisma.$transaction([
      prisma.orgSetupPaymentIntent.update({
        where: { id },
        data: {
          status: OrgSetupPaymentIntentStatus.PAID,
          paidLamports: intent.requiredLamports,
          paidAt: new Date(),
        },
      }),
      prisma.organization.update({
        where: { id: intent.organizationId },
        data: { status: OrgStatus.PENDING_TERMS },
      }),
    ]);

    return jsonResponse({
      status: "PAID",
      organizationId: intent.organizationId,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
