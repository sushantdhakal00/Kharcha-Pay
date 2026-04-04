import type { TreasuryPayoutIntentStatus } from "@prisma/client";

export interface PayoutTimelineEvent {
  action: string;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
}

export interface PayoutIntentForTimeline {
  id: string;
  status: TreasuryPayoutIntentStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
  onchainTxSig?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

export interface AuditLogForTimeline {
  action: string;
  createdAt: Date | string;
  metadata?: Record<string, unknown> | unknown | null;
}

export function buildPayoutTimeline(
  intent: PayoutIntentForTimeline,
  auditLogs: AuditLogForTimeline[]
): PayoutTimelineEvent[] {
  const events: PayoutTimelineEvent[] = [];

  events.push({
    action: "CREATED",
    timestamp: toIso(intent.createdAt),
  });

  const sortedLogs = [...auditLogs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const log of sortedLogs) {
    const meta = log.metadata as Record<string, unknown> | null;

    if (log.action === "PAYOUT_FUNDED_ONCHAIN") {
      events.push({
        action: "FUNDED_ONCHAIN",
        timestamp: toIso(log.createdAt),
        metadata: meta ? { txSig: meta.txSig } : null,
      });
    } else if (log.action === "PAYOUT_STATUS_CHANGED") {
      events.push({
        action: String(meta?.to ?? "STATUS_CHANGED"),
        timestamp: toIso(log.createdAt),
        metadata: meta ? { from: meta.from, to: meta.to, source: meta.source } : null,
      });
    } else if (log.action === "PAYOUT_FAILED") {
      events.push({
        action: "FAILED",
        timestamp: toIso(log.createdAt),
        metadata: meta
          ? { failureCode: meta.failureCode, from: meta.from }
          : null,
      });
    } else if (log.action === "WEBHOOK_RECEIVED") {
      events.push({
        action: "WEBHOOK_RECEIVED",
        timestamp: toIso(log.createdAt),
        metadata: meta ? { eventType: meta.eventType } : null,
      });
    }
  }

  if (events.length === 1 && intent.status !== "CREATED") {
    events.push({
      action: intent.status,
      timestamp: toIso(intent.updatedAt),
      metadata: intent.failureCode
        ? { failureCode: intent.failureCode, failureMessage: intent.failureMessage }
        : null,
    });
  }

  return deduplicateConsecutive(events);
}

function deduplicateConsecutive(events: PayoutTimelineEvent[]): PayoutTimelineEvent[] {
  const result: PayoutTimelineEvent[] = [];
  for (const event of events) {
    const prev = result[result.length - 1];
    if (prev && prev.action === event.action && prev.timestamp === event.timestamp) {
      continue;
    }
    result.push(event);
  }
  return result;
}

function toIso(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString();
}
