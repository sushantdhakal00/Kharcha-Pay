import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { jsonResponse } from "@/lib/json-response";
import { prisma } from "@/lib/db";
import { TreasuryLedgerAccount } from "@prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const url = new URL(req.url);
    const account = url.searchParams.get("account") as TreasuryLedgerAccount | null;
    const intentId = url.searchParams.get("intentId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam ?? "100", 10) || 100, 1), 500);

    const where: Record<string, unknown> = { orgId };
    if (account && Object.values(TreasuryLedgerAccount).includes(account)) {
      where.account = account;
    }
    if (intentId) {
      where.intentId = intentId;
    }
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) createdAt.lte = new Date(to);
      where.createdAt = createdAt;
    }

    const entries = await prisma.treasuryLedgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const rows = entries.map((e) => ({
      id: e.id,
      type: e.type,
      account: e.account,
      direction: e.direction,
      amountMinor: Number(e.amountMinor),
      amount: Number(e.amountMinor) / 100,
      currency: e.currency,
      intentId: e.intentId,
      provider: e.provider,
      payoutRail: e.payoutRail,
      externalRef: e.externalRef,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    }));

    return jsonResponse({ entries: rows });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
