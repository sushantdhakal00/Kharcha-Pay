import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { jsonResponse } from "@/lib/json-response";
import { checkOrgSetupRateLimit } from "@/lib/rate-limit";
import { OrgSetupPaymentIntentStatus } from "@prisma/client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { id } = await params;

    if (!checkOrgSetupRateLimit(user.id, "check")) {
      return jsonResponse(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    const intent = await prisma.orgSetupPaymentIntent.findFirst({
      where: { id, userId: user.id },
      include: { transactions: true },
    });

    if (!intent) {
      return jsonResponse({ error: "Intent not found" }, { status: 404 });
    }

    const now = new Date();
    if (intent.status === OrgSetupPaymentIntentStatus.PAID) {
      return jsonResponse({
        status: "PAID",
        organizationId: intent.organizationId,
        paidLamports: intent.paidLamports.toString(),
        requiredLamports: intent.requiredLamports.toString(),
        overpaidLamports: intent.overpaidLamports?.toString() ?? "0",
        paidAt: intent.paidAt?.toISOString(),
      });
    }

    if (intent.status === OrgSetupPaymentIntentStatus.EXPIRED) {
      return jsonResponse({
        status: "EXPIRED",
        paidLamports: intent.paidLamports.toString(),
        requiredLamports: intent.requiredLamports.toString(),
      });
    }

    if (intent.expiresAt < now) {
      await prisma.orgSetupPaymentIntent.update({
        where: { id },
        data: { status: OrgSetupPaymentIntentStatus.EXPIRED },
      });
      return jsonResponse({
        status: "EXPIRED",
        paidLamports: intent.paidLamports.toString(),
        requiredLamports: intent.requiredLamports.toString(),
      });
    }

    const remainingLamports =
      intent.requiredLamports > intent.paidLamports
        ? intent.requiredLamports - intent.paidLamports
        : BigInt(0);
    const overpaid =
      intent.paidLamports >= intent.requiredLamports
        ? intent.paidLamports - intent.requiredLamports
        : BigInt(0);

    return jsonResponse({
      status: intent.status,
      paidLamports: intent.paidLamports.toString(),
      requiredLamports: intent.requiredLamports.toString(),
      remainingLamports: remainingLamports.toString(),
      overpaidLamports: overpaid.toString(),
      expiresAt: intent.expiresAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
