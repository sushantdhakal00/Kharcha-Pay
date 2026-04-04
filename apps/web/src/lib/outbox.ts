/**
 * Outbox event emission for future webhooks/integrations.
 * Records events in OutboxEvent table; delivery not implemented yet.
 */
import { prisma } from "./db";

export type OutboxEventType =
  | "VENDOR_CREATED"
  | "VENDOR_ONBOARDING_STARTED"
  | "VENDOR_ACTIVATED"
  | "VENDOR_BLOCKED"
  | "VENDOR_BANK_CHANGE_REQUESTED"
  | "VENDOR_BANK_CHANGE_APPROVED"
  | "VENDOR_BANK_CHANGE_REJECTED"
  | "VENDOR_DOC_VERIFIED"
  | "VENDOR_DOC_UPLOADED"
  | "INVOICE_SUBMITTED"
  | "INVOICE_VERIFIED"
  | "INVOICE_REJECTED"
  | "MATCH_EXCEPTION_CREATED"
  | "MATCH_EXCEPTION_RESOLVED"
  | "PAYMENT_CREATED"
  | "PAYMENT_PAID";

export interface EmitOutboxEventParams {
  orgId: string;
  type: OutboxEventType;
  payload: Record<string, unknown>;
}

export async function emitOutboxEvent(params: EmitOutboxEventParams): Promise<void> {
  const { orgId, type, payload } = params;
  await prisma.outboxEvent.create({
    data: {
      orgId,
      type,
      payload: payload as object,
      status: "PENDING",
    },
  });
}
