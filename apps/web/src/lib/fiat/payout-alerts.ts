import type { PrismaClient } from "@prisma/client";
import type { PayoutSuccessRateResult } from "./payout-metrics";
import { emitTreasuryEvent, alertDedupKey } from "./treasury-events";

export interface PayoutAlert {
  type: "HIGH_FAILURE_RATE" | "STUCK_PAYOUTS" | "RETRY_STORM";
  severity: "warning" | "critical";
  message: string;
  details: Record<string, unknown>;
}

export function detectHighFailureRate(
  metrics: PayoutSuccessRateResult,
  threshold = 0.1
): PayoutAlert | null {
  if (metrics.total === 0) return null;

  const failureRate = metrics.failed / metrics.total;
  if (failureRate <= threshold) return null;

  return {
    type: "HIGH_FAILURE_RATE",
    severity: failureRate > 0.25 ? "critical" : "warning",
    message: `Payout failure rate is ${(failureRate * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(0)}%)`,
    details: {
      failureRate,
      threshold,
      failed: metrics.failed,
      total: metrics.total,
    },
  };
}

export async function detectStuckPayouts(
  db: PrismaClient,
  minutes = 60
): Promise<PayoutAlert | null> {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  const stuckCount = await db.treasuryPayoutIntent.count({
    where: {
      status: { in: ["PENDING", "SENT_ONCHAIN", "PROCESSING"] },
      updatedAt: { lt: cutoff },
    },
  });

  if (stuckCount === 0) return null;

  return {
    type: "STUCK_PAYOUTS",
    severity: stuckCount >= 5 ? "critical" : "warning",
    message: `${stuckCount} payout(s) stuck for over ${minutes} minutes`,
    details: {
      stuckCount,
      thresholdMinutes: minutes,
    },
  };
}

export async function detectRetryStorm(
  db: PrismaClient,
  threshold = 5
): Promise<PayoutAlert | null> {
  const highRetry = await db.treasuryPayoutIntent.count({
    where: {
      retryCount: { gte: threshold },
      status: { in: ["PENDING", "SENT_ONCHAIN", "PROCESSING"] },
    },
  });

  if (highRetry === 0) return null;

  return {
    type: "RETRY_STORM",
    severity: highRetry >= 3 ? "critical" : "warning",
    message: `${highRetry} payout(s) have retried ${threshold}+ times`,
    details: {
      count: highRetry,
      retryThreshold: threshold,
    },
  };
}

export async function emitAlertEvent(
  orgId: string,
  alert: PayoutAlert
): Promise<boolean> {
  return emitTreasuryEvent({
    orgId,
    type: "ALERT_RAISED",
    entityType: "PayoutAlert",
    entityId: alert.type,
    dedupKey: alertDedupKey(orgId, alert.type),
    payload: {
      alertType: alert.type,
      severity: alert.severity,
      message: alert.message,
      ...alert.details,
    },
  }).catch(() => false);
}

export function detectHighFailureRatePure(
  failed: number,
  total: number,
  threshold = 0.1
): PayoutAlert | null {
  if (total === 0) return null;
  const failureRate = failed / total;
  if (failureRate <= threshold) return null;

  return {
    type: "HIGH_FAILURE_RATE",
    severity: failureRate > 0.25 ? "critical" : "warning",
    message: `Payout failure rate is ${(failureRate * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(0)}%)`,
    details: { failureRate, threshold, failed, total },
  };
}
