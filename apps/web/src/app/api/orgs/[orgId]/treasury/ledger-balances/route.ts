import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess } from "@/lib/require-org-role";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import {
  computeAccountBalances,
  flattenBalances,
  ALL_ACCOUNTS,
  type LedgerEntryLike,
} from "@/lib/fiat/treasury-balances";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const latestSnapshots = await prisma.treasuryBalanceSnapshot.findMany({
      where: { orgId },
      orderBy: { asOf: "desc" },
      take: 50,
    });

    const seen = new Set<string>();
    const dedupedSnapshots = latestSnapshots.filter((s) => {
      const key = `${s.account}:${s.currency}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (dedupedSnapshots.length > 0) {
      const balances = dedupedSnapshots.map((s) => ({
        account: s.account,
        currency: s.currency,
        balanceMinor: s.balanceMinor.toString(),
        balanceMajor: (Number(s.balanceMinor) / 100).toFixed(2),
        asOf: s.asOf.toISOString(),
      }));

      return jsonResponse({
        source: "snapshot",
        asOf: dedupedSnapshots[0].asOf.toISOString(),
        balances,
      });
    }

    const entries = await prisma.treasuryLedgerEntry.findMany({
      where: { orgId },
      select: {
        account: true,
        direction: true,
        amountMinor: true,
        currency: true,
        createdAt: true,
      },
    });

    const byAccount = computeAccountBalances(entries as LedgerEntryLike[]);
    const flat = flattenBalances(byAccount);

    const balances = flat.map((f) => ({
      account: f.account,
      currency: f.currency,
      balanceMinor: f.balanceMinor.toString(),
      balanceMajor: (Number(f.balanceMinor) / 100).toFixed(2),
      asOf: new Date().toISOString(),
    }));

    return jsonResponse({
      source: "computed",
      asOf: new Date().toISOString(),
      balances,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
