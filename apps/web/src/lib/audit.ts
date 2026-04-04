/**
 * Immutable append-only audit logging for key finance actions.
 * Rules: INSERT only (never update/delete). Protect secrets.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export type AuditAction =
  | "ORG_CREATED"
  | "MEMBER_ADDED"
  | "MEMBER_ROLE_CHANGED"
  | "DEPT_CREATED"
  | "BUDGET_UPSERTED"
  | "REQUEST_CREATED"
  | "REQUEST_UPDATED"
  | "RECEIPT_UPLOADED"
  | "REQUEST_SUBMITTED"
  | "REQUEST_APPROVED"
  | "REQUEST_REJECTED"
  | "VENDOR_CREATED"
  | "VENDOR_WALLET_SET"
  | "VENDOR_UPDATED"
  | "VENDOR_STATUS_CHANGED"
  | "REQUEST_PAID"
  | "SPEND_POLICY_UPDATED"
  | "PAYMENT_BLOCKED"
  | "AUDIT_RETENTION_RUN"
  | "RECONCILIATION_RUN_STARTED"
  | "RECONCILIATION_RUN_FINISHED"
  | "PAYMENT_VERIFIED"
  | "PAYMENT_VERIFICATION_FAILED"
  | "DEMO_STARTED"
  | "DEMO_RESET"
  | "DEMO_SEEDED"
  | "PO_CREATED"
  | "PO_ISSUED"
  | "PO_CLOSED"
  | "RECEIPT_SUBMITTED"
  | "INVOICE_SUBMITTED"
  | "INVOICE_VERIFIED"
  | "INVOICE_REJECTED"
  | "INVOICE_EXCEPTION_CREATED"
  | "INVOICE_EXCEPTION_RESOLVED"
  | "INVOICE_ATTACHMENT_ADDED"
  | "INVOICE_ATTACHMENT_REMOVED"
  | "INVOICE_ATTACHMENT_DOWNLOADED"
  | "INVOICE_ASSIGNED"
  | "INVOICE_BULK_VERIFIED"
  | "INVOICE_CODING_UPDATED"
  | "MATCH_COMPUTED"
  | "VENDOR_ONBOARDING_STARTED"
  | "VENDOR_ACTIVATED"
  | "VENDOR_BLOCKED"
  | "VENDOR_BANK_CHANGE_REQUESTED"
  | "VENDOR_BANK_CHANGE_APPROVED"
  | "VENDOR_BANK_CHANGE_REJECTED"
  | "VENDOR_DOC_UPLOADED"
  | "VENDOR_DOC_VERIFIED"
  | "CHANNEL_CREATED"
  | "CHANNEL_UPDATED"
  | "CHANNEL_ARCHIVED"
  | "CHANNEL_DELETED"
  | "CHANNEL_PERMISSIONS_UPDATED"
  | "MESSAGE_SENT"
  | "MESSAGE_EDITED"
  | "MESSAGE_DELETED"
  | "MESSAGE_PINNED"
  | "MESSAGE_UNPINNED"
  | "MEMBER_AVATAR_UPDATED"
  | "WEBHOOK_ENDPOINT_CREATED"
  | "WEBHOOK_ENDPOINT_UPDATED"
  | "WEBHOOK_ENDPOINT_DISABLED"
  | "WEBHOOK_ENDPOINT_DELETED"
  | "WEBHOOK_REPLAY_TRIGGERED";

export type AuditEntityType =
  | "Organization"
  | "Membership"
  | "Department"
  | "MonthlyBudget"
  | "ExpenseRequest"
  | "Vendor"
  | "OrgSpendPolicy"
  | "PaymentReconciliation"
  | "PurchaseOrder"
  | "GoodsReceipt"
  | "Invoice"
  | "MatchResult"
  | "InvoiceAttachment"
  | "VendorContact"
  | "VendorDocument"
  | "VendorPaymentMethod"
  | "VendorBankChangeRequest"
  | "VendorOnboardingCase"
  | "ChatChannel"
  | "ChatMessage"
  | "WebhookEndpoint"
  | "OutboxEvent";

export interface LogAuditEventParams {
  orgId: string;
  actorUserId?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

const SECRET_KEYS = ["password", "privateKey", "keypair", "jwt", "token", "secret"];

/** Sanitize value: strip secrets, convert BigInt to string. */
function sanitizeValue(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(sanitizeValue);
  if (v !== null && typeof v === "object" && !(v instanceof Date)) {
    const obj = v as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(obj)) {
      const keyLower = k.toLowerCase();
      if (SECRET_KEYS.some((s) => keyLower.includes(s))) continue;
      result[k] = sanitizeValue(val);
    }
    return result;
  }
  return v;
}

function sanitizeForAudit(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const sanitized = sanitizeValue(v);
    if (sanitized !== undefined) result[k] = sanitized;
  }
  return result;
}

/** Insert-only audit event. Never update or delete. */
export async function logAuditEvent(params: LogAuditEventParams): Promise<void> {
  const { orgId, actorUserId, action, entityType, entityId, before, after, metadata } = params;
  const beforeJson: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
    before ? (sanitizeForAudit(before) as Prisma.InputJsonValue) : Prisma.JsonNull;
  const afterJson: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
    after ? (sanitizeForAudit(after) as Prisma.InputJsonValue) : Prisma.JsonNull;
  const metadataJson: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
    metadata ? (sanitizeForAudit(metadata) as Prisma.InputJsonValue) : Prisma.JsonNull;

  await prisma.auditEvent.create({
    data: {
      orgId,
      actorUserId: actorUserId ?? null,
      action,
      entityType,
      entityId,
      beforeJson,
      afterJson,
      metadataJson,
    },
  });
}
