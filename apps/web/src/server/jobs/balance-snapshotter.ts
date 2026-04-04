import { prisma } from "@/lib/db";
import {
  computeAccountBalances,
  flattenBalances,
  type LedgerEntryLike,
} from "@/lib/fiat/treasury-balances";
import { emitTreasuryEvent } from "@/lib/fiat/treasury-events";

export interface SnapshotResult {
  orgId: string;
  snapshotsCreated: number;
  asOf: string;
}

export async function createBalanceSnapshots(
  orgId: string,
  asOf: Date = new Date()
): Promise<SnapshotResult> {
  const entries = await prisma.treasuryLedgerEntry.findMany({
    where: { orgId, createdAt: { lte: asOf } },
    select: {
      account: true,
      direction: true,
      amountMinor: true,
      currency: true,
      createdAt: true,
    },
  });

  const balances = computeAccountBalances(entries as LedgerEntryLike[]);
  const flat = flattenBalances(balances);

  let created = 0;
  for (const row of flat) {
    try {
      await prisma.treasuryBalanceSnapshot.create({
        data: {
          orgId,
          account: row.account as any,
          currency: row.currency,
          balanceMinor: row.balanceMinor,
          asOf,
        },
      });
      created++;
    } catch (e: unknown) {
      const pe = e as { code?: string };
      if (pe.code === "P2002") continue;
      throw e;
    }
  }

  if (created > 0) {
    await emitTreasuryEvent({
      orgId,
      type: "BALANCE_SNAPSHOT_WRITTEN" as any,
      entityType: "TreasuryBalanceSnapshot",
      entityId: orgId,
      dedupKey: `balance-snapshot:${orgId}:${asOf.toISOString()}`,
      payload: {
        orgId,
        snapshotsCreated: created,
        asOf: asOf.toISOString(),
      },
    }).catch(() => {});
  }

  return { orgId, snapshotsCreated: created, asOf: asOf.toISOString() };
}

export async function createBalanceSnapshotsAllOrgs(
  asOf: Date = new Date()
): Promise<SnapshotResult[]> {
  const orgs = await prisma.treasuryLedgerEntry.findMany({
    select: { orgId: true },
    distinct: ["orgId"],
  });

  const results: SnapshotResult[] = [];
  for (const { orgId } of orgs) {
    const result = await createBalanceSnapshots(orgId, asOf);
    results.push(result);
  }
  return results;
}

export { computeAccountBalances, flattenBalances };
