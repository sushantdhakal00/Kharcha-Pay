import { TreasuryPayoutIntentStatus } from "@prisma/client";

const {
  CREATED,
  PENDING,
  SENT_ONCHAIN,
  PROCESSING,
  COMPLETED,
  FAILED,
  CANCELED,
} = TreasuryPayoutIntentStatus;

const VALID_TRANSITIONS: Record<
  TreasuryPayoutIntentStatus,
  TreasuryPayoutIntentStatus[]
> = {
  [CREATED]: [PENDING, CANCELED, FAILED],
  [PENDING]: [SENT_ONCHAIN, PROCESSING, FAILED, CANCELED],
  [SENT_ONCHAIN]: [PROCESSING, FAILED],
  [PROCESSING]: [COMPLETED, FAILED],
  [COMPLETED]: [],
  [FAILED]: [],
  [CANCELED]: [],
};

const TERMINAL_STATUSES = new Set<TreasuryPayoutIntentStatus>([
  COMPLETED,
  FAILED,
  CANCELED,
]);

export function isTerminalStatus(
  status: TreasuryPayoutIntentStatus
): boolean {
  return TERMINAL_STATUSES.has(status);
}

export class InvalidPayoutTransitionError extends Error {
  code = "INVALID_PAYOUT_TRANSITION" as const;
  constructor(
    public from: TreasuryPayoutIntentStatus,
    public to: TreasuryPayoutIntentStatus
  ) {
    super(`Invalid payout transition: ${from} → ${to}`);
    this.name = "InvalidPayoutTransitionError";
  }
}

export function assertValidPayoutTransition(
  from: TreasuryPayoutIntentStatus,
  to: TreasuryPayoutIntentStatus
): void {
  if (from === to) return;
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidPayoutTransitionError(from, to);
  }
}

export function isValidPayoutTransition(
  from: TreasuryPayoutIntentStatus,
  to: TreasuryPayoutIntentStatus
): boolean {
  if (from === to) return true;
  const allowed = VALID_TRANSITIONS[from];
  return !!allowed && allowed.includes(to);
}
