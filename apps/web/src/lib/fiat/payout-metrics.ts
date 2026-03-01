import type { PrismaClient, TreasuryPayoutIntentStatus } from "@prisma/client";

export interface PayoutSuccessRateResult {
  total: number;
  completed: number;
  failed: number;
  canceled: number;
  successRate: number;
}

export async function getPayoutSuccessRate(
  db: PrismaClient,
  orgId?: string,
  windowDays = 30
): Promise<PayoutSuccessRateResult> {
  const since = daysAgo(windowDays);
  const where = { createdAt: { gte: since }, ...(orgId ? { orgId } : {}) };

  const [total, completed, failed, canceled] = await Promise.all([
    db.treasuryPayoutIntent.count({ where }),
    db.treasuryPayoutIntent.count({ where: { ...where, status: "COMPLETED" } }),
    db.treasuryPayoutIntent.count({ where: { ...where, status: "FAILED" } }),
    db.treasuryPayoutIntent.count({ where: { ...where, status: "CANCELED" } }),
  ]);

  return {
    total,
    completed,
    failed,
    canceled,
    successRate: total > 0 ? completed / total : 0,
  };
}

export interface AvgCompletionTimeResult {
  avgMs: number;
  count: number;
}

export async function getAverageCompletionTime(
  db: PrismaClient,
  orgId?: string,
  windowDays = 30
): Promise<AvgCompletionTimeResult> {
  const since = daysAgo(windowDays);
  const where = {
    status: "COMPLETED" as TreasuryPayoutIntentStatus,
    createdAt: { gte: since },
    ...(orgId ? { orgId } : {}),
  };

  const completed = await db.treasuryPayoutIntent.findMany({
    where,
    select: { createdAt: true, updatedAt: true },
  });

  if (completed.length === 0) return { avgMs: 0, count: 0 };

  const totalMs = completed.reduce(
    (sum, p) => sum + (p.updatedAt.getTime() - p.createdAt.getTime()),
    0
  );

  return { avgMs: totalMs / completed.length, count: completed.length };
}

export interface FailureBreakdownEntry {
  failureCode: string;
  count: number;
}

export async function getFailureBreakdown(
  db: PrismaClient,
  windowDays = 30
): Promise<FailureBreakdownEntry[]> {
  const since = daysAgo(windowDays);

  const failed = await db.treasuryPayoutIntent.findMany({
    where: {
      status: "FAILED",
      createdAt: { gte: since },
    },
    select: { failureCode: true },
  });

  const counts = new Map<string, number>();
  for (const row of failed) {
    const code = row.failureCode ?? "UNKNOWN";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([failureCode, count]) => ({ failureCode, count }))
    .sort((a, b) => b.count - a.count);
}

export interface DailyVolumeEntry {
  date: string;
  volumeUsd: number;
  count: number;
}

export async function getPayoutVolumeSeries(
  db: PrismaClient,
  windowDays = 30
): Promise<DailyVolumeEntry[]> {
  const since = daysAgo(windowDays);

  const intents = await db.treasuryPayoutIntent.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, amountMinor: true, currency: true },
    orderBy: { createdAt: "asc" },
  });

  const byDay = new Map<string, { volumeMinor: bigint; count: number }>();

  for (const intent of intents) {
    const day = intent.createdAt.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { volumeMinor: BigInt(0), count: 0 };
    entry.volumeMinor += intent.amountMinor;
    entry.count++;
    byDay.set(day, entry);
  }

  return Array.from(byDay.entries()).map(([date, entry]) => ({
    date,
    volumeUsd: Number(entry.volumeMinor) / 100,
    count: entry.count,
  }));
}

export function computeSuccessRate(completed: number, total: number): number {
  return total > 0 ? completed / total : 0;
}

export function computeAvgCompletionMs(
  payouts: Array<{ createdAt: Date; updatedAt: Date }>
): number {
  if (payouts.length === 0) return 0;
  const totalMs = payouts.reduce(
    (sum, p) => sum + (p.updatedAt.getTime() - p.createdAt.getTime()),
    0
  );
  return totalMs / payouts.length;
}

export function aggregateDailyVolume(
  intents: Array<{ createdAt: Date; amountMinor: bigint }>
): DailyVolumeEntry[] {
  const byDay = new Map<string, { volumeMinor: bigint; count: number }>();

  for (const intent of intents) {
    const day = intent.createdAt.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { volumeMinor: BigInt(0), count: 0 };
    entry.volumeMinor += intent.amountMinor;
    entry.count++;
    byDay.set(day, entry);
  }

  return Array.from(byDay.entries()).map(([date, entry]) => ({
    date,
    volumeUsd: Number(entry.volumeMinor) / 100,
    count: entry.count,
  }));
}

export function aggregateFailureBreakdown(
  failures: Array<{ failureCode: string | null }>
): FailureBreakdownEntry[] {
  const counts = new Map<string, number>();
  for (const row of failures) {
    const code = row.failureCode ?? "UNKNOWN";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([failureCode, count]) => ({ failureCode, count }))
    .sort((a, b) => b.count - a.count);
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
