import { env } from "@/lib/env";
import { TreasuryDepositIntentStatus, TreasuryPayoutIntentStatus } from "@prisma/client";

export function verifyCircleWebhook(headerSecret: string | null): boolean {
  const expected = env.CIRCLE_WEBHOOK_SECRET;
  if (!expected) return false;
  if (!headerSecret) return false;
  return headerSecret === expected;
}

export interface ParsedCircleEvent {
  eventId: string;
  eventType: string;
  objectId: string;
  status?: string;
  failureCode?: string;
  failureMessage?: string;
}

export function parseCircleWebhook(body: unknown): ParsedCircleEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const eventId = typeof b.id === "string" ? b.id : undefined;
  const eventType = typeof b.type === "string" ? b.type : undefined;

  let objectId: string | undefined;
  let status: string | undefined;
  let failureCode: string | undefined;
  let failureMessage: string | undefined;

  const data = b.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    objectId = typeof d.id === "string" ? d.id : undefined;
    status = typeof d.status === "string" ? d.status : undefined;
    failureCode = typeof d.errorCode === "string" ? d.errorCode : undefined;
    failureMessage = typeof d.errorMessage === "string" ? d.errorMessage : undefined;

    if (!objectId) {
      const obj = d.object;
      if (obj && typeof obj === "object") {
        const o = obj as Record<string, unknown>;
        objectId = typeof o.id === "string" ? o.id : undefined;
        if (!status) {
          status = typeof o.status === "string" ? o.status : undefined;
        }
        if (!failureCode) {
          failureCode = typeof o.errorCode === "string" ? o.errorCode : undefined;
        }
        if (!failureMessage) {
          failureMessage = typeof o.errorMessage === "string" ? o.errorMessage : undefined;
        }
      }
    }
  }

  if (!eventId || !eventType || !objectId) return null;

  return { eventId, eventType, objectId, status, failureCode, failureMessage };
}

const STATUS_MAP: Record<string, TreasuryDepositIntentStatus> = {
  pending: TreasuryDepositIntentStatus.PENDING,
  processing: TreasuryDepositIntentStatus.PENDING,
  complete: TreasuryDepositIntentStatus.COMPLETED,
  completed: TreasuryDepositIntentStatus.COMPLETED,
  succeeded: TreasuryDepositIntentStatus.COMPLETED,
  paid: TreasuryDepositIntentStatus.COMPLETED,
  failed: TreasuryDepositIntentStatus.FAILED,
  canceled: TreasuryDepositIntentStatus.FAILED,
  cancelled: TreasuryDepositIntentStatus.FAILED,
  rejected: TreasuryDepositIntentStatus.FAILED,
};

export function mapCircleStatusToIntent(
  rawStatus: string | undefined
): TreasuryDepositIntentStatus | null {
  if (!rawStatus) return null;
  return STATUS_MAP[rawStatus.toLowerCase()] ?? null;
}

// Day 37: Payout status mapping
const PAYOUT_STATUS_MAP: Record<string, TreasuryPayoutIntentStatus> = {
  pending: TreasuryPayoutIntentStatus.PENDING,
  queued: TreasuryPayoutIntentStatus.PENDING,
  processing: TreasuryPayoutIntentStatus.PROCESSING,
  complete: TreasuryPayoutIntentStatus.COMPLETED,
  completed: TreasuryPayoutIntentStatus.COMPLETED,
  paid: TreasuryPayoutIntentStatus.COMPLETED,
  failed: TreasuryPayoutIntentStatus.FAILED,
  rejected: TreasuryPayoutIntentStatus.FAILED,
  returned: TreasuryPayoutIntentStatus.FAILED,
  canceled: TreasuryPayoutIntentStatus.CANCELED,
  cancelled: TreasuryPayoutIntentStatus.CANCELED,
};

export function mapCircleStatusToPayoutStatus(
  rawStatus: string | undefined
): TreasuryPayoutIntentStatus | null {
  if (!rawStatus) return null;
  return PAYOUT_STATUS_MAP[rawStatus.toLowerCase()] ?? null;
}

const PAYOUT_EVENT_PREFIXES = ["payouts", "payout"];

export function isPayoutEvent(eventType: string): boolean {
  const lower = eventType.toLowerCase();
  return PAYOUT_EVENT_PREFIXES.some(
    (prefix) => lower.startsWith(prefix + ".") || lower === prefix
  );
}
