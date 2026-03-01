import { TreasuryPayoutIntentStatus, PayoutMethodType } from "@prisma/client";
import {
  createRecipientBankAccount,
  createPayout,
  getPayout,
  CircleApiError,
  uuid,
} from "../../circle-client";
import type {
  PayoutProvider,
  RecipientProfileInput,
  PayoutInput,
  ProviderRecipientRef,
  ProviderPayoutRef,
  ProviderPayoutStatusResult,
  ProviderPayoutStatus,
  ProviderErrorClassification,
} from "../types";
import { ProviderError } from "../types";
import { isRailSupported } from "../capabilities";

const CIRCLE_STATUS_MAP: Record<string, ProviderPayoutStatus> = {
  pending: "PENDING",
  queued: "PENDING",
  processing: "PROCESSING",
  complete: "COMPLETED",
  completed: "COMPLETED",
  paid: "COMPLETED",
  failed: "FAILED",
  rejected: "FAILED",
  returned: "FAILED",
  canceled: "CANCELED",
  cancelled: "CANCELED",
};

export function normalizeCircleStatus(
  rawStatus: string | undefined
): ProviderPayoutStatus | null {
  if (!rawStatus) return null;
  return CIRCLE_STATUS_MAP[rawStatus.toLowerCase()] ?? null;
}

export function mapCircleStatusToIntentStatus(
  rawStatus: string | undefined
): TreasuryPayoutIntentStatus | null {
  const normalized = normalizeCircleStatus(rawStatus);
  if (!normalized) return null;
  return normalized as TreasuryPayoutIntentStatus;
}

export function normalizeCircleFailure(providerFailure: unknown): {
  code: string;
  message: string;
  classification: ProviderErrorClassification;
} | null {
  if (!providerFailure || typeof providerFailure !== "object") return null;
  const f = providerFailure as Record<string, unknown>;
  const code =
    typeof f.errorCode === "string"
      ? f.errorCode
      : typeof f.code === "string"
        ? f.code
        : "UNKNOWN";
  const message =
    typeof f.errorMessage === "string"
      ? f.errorMessage
      : typeof f.message === "string"
        ? f.message
        : "Unknown provider failure";

  const classification = classifyCircleError(code);
  return { code, message, classification };
}

function classifyCircleError(code: string): ProviderErrorClassification {
  const lower = code.toLowerCase();
  if (
    lower.includes("insufficient") ||
    lower.includes("invalid") ||
    lower.includes("not_found") ||
    lower.includes("denied") ||
    lower.includes("blocked") ||
    lower.includes("compliance")
  ) {
    return "PERMANENT";
  }
  if (
    lower.includes("config") ||
    lower.includes("not_configured") ||
    lower.includes("unauthorized")
  ) {
    return "CONFIG";
  }
  return "TRANSIENT";
}

function classifyCircleApiError(e: CircleApiError): ProviderErrorClassification {
  if (e.status >= 500) return "TRANSIENT";
  if (e.status === 401 || e.status === 403) return "CONFIG";
  return "PERMANENT";
}

export class CircleProvider implements PayoutProvider {
  readonly name = "CIRCLE";

  async createRecipient(
    input: RecipientProfileInput
  ): Promise<ProviderRecipientRef> {
    const rail = input.payoutMethodType;

    if (
      rail === PayoutMethodType.ACH ||
      rail === PayoutMethodType.LOCAL
    ) {
      if (!isRailSupported("CIRCLE", rail, input.currency ?? "USD")) {
        throw new ProviderError(
          `Rail "${rail}" is not supported by CIRCLE provider. Enable via ENABLE_${rail === PayoutMethodType.ACH ? "ACH" : "LOCAL"}_PAYOUTS env flag.`,
          "CONFIG",
          "UNSUPPORTED_RAIL"
        );
      }
    }

    const idempotencyKey = uuid();

    try {
      const result = await createRecipientBankAccount({
        idempotencyKey,
        accountNumber: input.accountNumber ?? "",
        routingNumber: input.routingNumber ?? "",
        billingDetails: {
          name: input.billingName ?? "",
          city: input.billingCity ?? "",
          country: input.billingCountry ?? "US",
          line1: input.billingLine1 ?? "",
          district: input.billingDistrict,
          postalCode: input.billingPostalCode,
        },
        bankAddress: {
          bankName: input.bankName,
          city: input.bankCity,
          country: input.bankCountry ?? "US",
        },
      });

      return {
        providerRecipientId: result.id,
        providerMeta: {
          status: result.status,
          trackingRef: result.trackingRef,
          rail,
        },
      };
    } catch (e) {
      if (e instanceof CircleApiError) {
        throw new ProviderError(
          e.message,
          classifyCircleApiError(e),
          `HTTP_${e.status}`,
          { cause: e }
        );
      }
      throw e;
    }
  }

  async createPayout(input: PayoutInput): Promise<ProviderPayoutRef> {
    const rail = input.payoutRail;

    if (
      rail === PayoutMethodType.ACH ||
      rail === PayoutMethodType.LOCAL
    ) {
      if (!isRailSupported("CIRCLE", rail, input.amount.currency)) {
        throw new ProviderError(
          `Rail "${rail}" is not supported by CIRCLE provider. Enable via ENABLE_${rail === PayoutMethodType.ACH ? "ACH" : "LOCAL"}_PAYOUTS env flag.`,
          "CONFIG",
          "UNSUPPORTED_RAIL"
        );
      }
    }

    const amountStr = (Number(input.amount.amountMinor) / 100).toFixed(2);

    const destinationType =
      rail === PayoutMethodType.ACH ? "ach" : "wire";

    try {
      const result = await createPayout({
        idempotencyKey: input.idempotencyKey,
        destinationBankAccountId: input.recipientId,
        amount: { amount: amountStr, currency: input.amount.currency },
        metadata: input.metadata as
          | { beneficiaryEmail?: string }
          | undefined,
        destinationType,
      });

      const initialStatus = normalizeCircleStatus(result.status) ?? "CREATED";

      return {
        providerPayoutId: result.id,
        providerTrackingRef: result.trackingRef,
        initialStatus,
        fundingDestination: null,
        providerMeta: {
          sourceWalletId: result.sourceWalletId,
          rail,
        },
      };
    } catch (e) {
      if (e instanceof CircleApiError) {
        throw new ProviderError(
          e.message,
          classifyCircleApiError(e),
          `HTTP_${e.status}`,
          { cause: e }
        );
      }
      throw e;
    }
  }

  async getPayout(
    providerPayoutId: string
  ): Promise<ProviderPayoutStatusResult> {
    try {
      const result = await getPayout(providerPayoutId);

      const status = normalizeCircleStatus(result.status) ?? "PENDING";

      return {
        status,
        rawStatus: result.status ?? "unknown",
      };
    } catch (e) {
      if (e instanceof CircleApiError) {
        throw new ProviderError(
          e.message,
          classifyCircleApiError(e),
          `HTTP_${e.status}`,
          { cause: e }
        );
      }
      throw e;
    }
  }

  normalizeStatus(providerStatusString: string): ProviderPayoutStatus | null {
    return normalizeCircleStatus(providerStatusString);
  }

  normalizeFailure(providerFailure: unknown) {
    return normalizeCircleFailure(providerFailure);
  }
}
