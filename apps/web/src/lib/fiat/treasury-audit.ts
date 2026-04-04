import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type TreasuryAuditAction =
  | "PAYOUT_CREATED"
  | "PAYOUT_FUNDED_ONCHAIN"
  | "PAYOUT_STATUS_CHANGED"
  | "PAYOUT_FAILED"
  | "WEBHOOK_RECEIVED"
  | "POLICY_EVALUATED"
  | "POLICY_BLOCKED_PAYOUT"
  | "PAYOUT_APPROVAL_REQUESTED"
  | "PAYOUT_APPROVED"
  | "PAYOUT_REJECTED"
  | "WALLET_CREATED"
  | "WALLET_UPDATED"
  | "MINT_CREATED"
  | "MINT_UPDATED"
  | "SPEND_POLICY_UPDATED"
  | "ONCHAIN_TRANSFER_BLOCKED_BY_POLICY"
  | "SAFETY_CONTROLS_UPDATED"
  | "SAFETY_BLOCKED_EXECUTION"
  | "CIRCUIT_BREAKER_TRIPPED"
  | "CIRCUIT_BREAKER_RESET";

export interface LogTreasuryAuditParams {
  orgId: string;
  actorId?: string | null;
  action: TreasuryAuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown> | null;
}

export async function logTreasuryAudit(
  params: LogTreasuryAuditParams
): Promise<void> {
  const { orgId, actorId, action, entityType, entityId, metadata } = params;

  const metadataJson: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
    metadata
      ? (metadata as Prisma.InputJsonValue)
      : Prisma.JsonNull;

  await prisma.treasuryAuditLog.create({
    data: {
      orgId,
      actorId: actorId ?? null,
      action,
      entityType,
      entityId,
      metadata: metadataJson,
    },
  });
}
