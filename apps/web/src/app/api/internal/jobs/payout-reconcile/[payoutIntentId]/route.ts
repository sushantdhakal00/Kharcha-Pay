import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { jsonResponse } from "@/lib/json-response";
import { prisma } from "@/lib/db";
import { reconcileSingleIntent } from "@/server/jobs/payout-reconciler";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ payoutIntentId: string }> }
) {
  const secret =
    req.headers.get("x-internal-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!env.INTERNAL_JOB_SECRET || secret !== env.INTERNAL_JOB_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { payoutIntentId } = await params;

  try {
    const intent = await prisma.treasuryPayoutIntent.findUnique({
      where: { id: payoutIntentId },
      select: {
        id: true,
        orgId: true,
        provider: true,
        status: true,
        amountMinor: true,
        currency: true,
        payoutRail: true,
        providerPayoutId: true,
        circlePayoutId: true,
        retryCount: true,
      },
    });

    if (!intent) {
      return jsonResponse({ error: "Payout intent not found" }, { status: 404 });
    }

    await reconcileSingleIntent(intent);

    const updated = await prisma.treasuryPayoutIntent.findUnique({
      where: { id: payoutIntentId },
      select: {
        id: true,
        status: true,
        failureCode: true,
        failureMessage: true,
        retryCount: true,
        lastStatusRefreshAt: true,
      },
    });

    return jsonResponse({ intent: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
