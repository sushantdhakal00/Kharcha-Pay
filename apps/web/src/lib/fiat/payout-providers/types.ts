import { PayoutMethodType } from "@prisma/client";

export type ProviderPayoutStatus =
  | "CREATED"
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED";

export type ProviderErrorClassification = "TRANSIENT" | "PERMANENT" | "CONFIG";

export class ProviderError extends Error {
  constructor(
    message: string,
    public classification: ProviderErrorClassification,
    public providerCode?: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ProviderError";
  }
}

export interface ProviderRecipientRef {
  providerRecipientId: string;
  providerMeta?: Record<string, unknown>;
}

export interface ProviderPayoutRef {
  providerPayoutId: string;
  providerTrackingRef?: string;
  initialStatus: ProviderPayoutStatus;
  fundingDestination?: Record<string, unknown> | null;
  providerMeta?: Record<string, unknown>;
}

export interface ProviderPayoutStatusResult {
  status: ProviderPayoutStatus;
  rawStatus: string;
  failureCode?: string;
  failureMessage?: string;
}

export interface RecipientProfileInput {
  payoutMethodType: PayoutMethodType;
  currency?: string;
  accountNumber?: string;
  routingNumber?: string;
  billingName?: string;
  billingCity?: string;
  billingCountry?: string;
  billingLine1?: string;
  billingDistrict?: string;
  billingPostalCode?: string;
  bankName?: string;
  bankCity?: string;
  bankCountry?: string;
}

export interface PayoutInput {
  idempotencyKey: string;
  recipientId: string;
  amount: { amountMinor: bigint; currency: string };
  payoutRail: PayoutMethodType;
  metadata?: Record<string, unknown>;
}

export interface PayoutProvider {
  readonly name: string;

  createRecipient(input: RecipientProfileInput): Promise<ProviderRecipientRef>;

  createPayout(input: PayoutInput): Promise<ProviderPayoutRef>;

  getPayout(providerPayoutId: string): Promise<ProviderPayoutStatusResult>;

  normalizeStatus(providerStatusString: string): ProviderPayoutStatus | null;

  normalizeFailure(providerFailure: unknown): {
    code: string;
    message: string;
    classification: ProviderErrorClassification;
  } | null;
}
