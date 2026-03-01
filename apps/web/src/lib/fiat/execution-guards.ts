import { prisma } from "@/lib/db";

export class MissingIdempotencyKeyError extends Error {
  code = "MISSING_IDEMPOTENCY_KEY" as const;
  constructor() {
    super("Payout intent must have an idempotencyKey for exactly-once execution");
  }
}

export class DuplicateExecutionError extends Error {
  code = "DUPLICATE_EXECUTION" as const;
  constructor(
    public readonly intentId: string,
    public readonly field: string
  ) {
    super(`Payout intent ${intentId} has already been executed (duplicate ${field})`);
  }
}

export class DuplicateOnchainTxError extends Error {
  code = "DUPLICATE_ONCHAIN_TX" as const;
  constructor(
    public readonly txSig: string
  ) {
    super(`On-chain transaction ${txSig} has already been submitted`);
  }
}

export function assertIdempotencyKeyPresent(intent: {
  id: string;
  idempotencyKey?: string | null;
}): void {
  if (!intent.idempotencyKey) {
    throw new MissingIdempotencyKeyError();
  }
}

export async function assertNotAlreadyExecuted(intent: {
  id: string;
  providerPayoutId?: string | null;
  circlePayoutId?: string | null;
  onchainTxSig?: string | null;
  status: string;
}): Promise<void> {
  const terminalStatuses = ["COMPLETED", "FAILED", "CANCELED"];
  if (terminalStatuses.includes(intent.status)) {
    throw new DuplicateExecutionError(intent.id, "status");
  }

  if (intent.providerPayoutId || intent.circlePayoutId) {
    const existingProviderPayout = await prisma.treasuryPayoutIntent.findFirst({
      where: {
        id: { not: intent.id },
        OR: [
          intent.providerPayoutId
            ? { providerPayoutId: intent.providerPayoutId }
            : {},
          intent.circlePayoutId
            ? { circlePayoutId: intent.circlePayoutId }
            : {},
        ].filter((c) => Object.keys(c).length > 0),
      },
      select: { id: true },
    });
    if (existingProviderPayout) {
      throw new DuplicateExecutionError(
        intent.id,
        "providerPayoutId"
      );
    }
  }
}

export async function assertOnchainTxNotDuplicate(
  orgId: string,
  txSig: string,
  excludeIntentId?: string
): Promise<void> {
  if (!txSig) return;

  const existing = await prisma.treasuryPayoutIntent.findFirst({
    where: {
      orgId,
      onchainTxSig: txSig,
      ...(excludeIntentId ? { id: { not: excludeIntentId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new DuplicateOnchainTxError(txSig);
  }
}
