import { getCircleConfig } from "./circle-config";

export class CircleApiError extends Error {
  constructor(
    public status: number,
    public body: unknown
  ) {
    super(`Circle API error: ${status}`);
    this.name = "CircleApiError";
  }
}

async function circleFetch(
  path: string,
  opts: { method?: string; body?: object; idempotencyKey?: string }
): Promise<unknown> {
  const { apiKey, baseUrl, enabled } = getCircleConfig();
  if (!enabled) throw new CircleApiError(0, { error: "Circle not configured" });

  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (opts.idempotencyKey) {
    headers["X-Request-Id"] = opts.idempotencyKey;
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new CircleApiError(res.status, body);
  }

  return body;
}

export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function createCircleCustomer(name: string): Promise<{ id: string }> {
  const body = (await circleFetch("/v1/businessAccount/banks/wires", {
    method: "POST",
    body: {
      idempotencyKey: uuid(),
      accountNumber: "12340010",
      routingNumber: "121000248",
      billingDetails: {
        name: name.slice(0, 1024),
        city: "Boston",
        country: "US",
        line1: "100 Money Street",
        district: "MA",
        postalCode: "01234",
      },
      bankAddress: {
        bankName: "SAN FRANCISCO",
        city: "SAN FRANCISCO",
        country: "US",
        line1: "100 Money Street",
        district: "CA",
      },
    },
  })) as { data?: { id: string } };

  const id = body?.data?.id;
  if (!id) throw new CircleApiError(500, body);
  return { id };
}

export async function createDepositIntent(params: {
  customerId: string;
  amountMinor: bigint;
  currency: string;
}): Promise<{
  id: string;
  fundingInstructions?: unknown;
  hostedUrl?: string;
}> {
  const { customerId, currency } = params;

  const instructionsBody = (await circleFetch(
    `/v1/businessAccount/banks/wires/${customerId}/instructions?currency=${currency}`,
    { method: "GET" }
  )) as { data?: unknown };

  const fundingInstructions = instructionsBody?.data ?? {};
  const intentId = uuid();

  return {
    id: intentId,
    fundingInstructions,
    hostedUrl: undefined,
  };
}

// ---- Day 37: Payout / Off-Ramp ----

export interface CircleRecipientBankResult {
  id: string;
  status?: string;
  trackingRef?: string;
}

/**
 * Create a wire bank account for a payout recipient.
 * Circle API: POST /v1/banks/wires
 * See: https://developers.circle.com/circle-mint/reference/createbankaccount
 */
export async function createRecipientBankAccount(params: {
  idempotencyKey: string;
  accountNumber: string;
  routingNumber: string;
  billingDetails: {
    name: string;
    city: string;
    country: string;
    line1: string;
    district?: string;
    postalCode?: string;
  };
  bankAddress: {
    bankName?: string;
    city?: string;
    country: string;
    line1?: string;
    district?: string;
  };
}): Promise<CircleRecipientBankResult> {
  const body = (await circleFetch("/v1/banks/wires", {
    method: "POST",
    idempotencyKey: params.idempotencyKey,
    body: {
      idempotencyKey: params.idempotencyKey,
      accountNumber: params.accountNumber,
      routingNumber: params.routingNumber,
      billingDetails: params.billingDetails,
      bankAddress: params.bankAddress,
    },
  })) as { data?: { id?: string; status?: string; trackingRef?: string } };

  const id = body?.data?.id;
  if (!id) throw new CircleApiError(500, body);
  return {
    id,
    status: body.data?.status,
    trackingRef: body.data?.trackingRef,
  };
}

export interface CirclePayoutResult {
  id: string;
  status?: string;
  sourceWalletId?: string;
  destination?: unknown;
  amount?: { amount?: string; currency?: string };
  fees?: unknown;
  trackingRef?: string;
}

/**
 * Create a payout (off-ramp: USDC -> fiat wire).
 * Circle API: POST /v1/payouts
 * See: https://developers.circle.com/circle-mint/reference/createpayout
 */
export async function createPayout(params: {
  idempotencyKey: string;
  destinationBankAccountId: string;
  amount: { amount: string; currency: string };
  metadata?: { beneficiaryEmail?: string };
  destinationType?: string;
}): Promise<CirclePayoutResult> {
  const destType = params.destinationType ?? "wire";
  const body = (await circleFetch("/v1/payouts", {
    method: "POST",
    idempotencyKey: params.idempotencyKey,
    body: {
      idempotencyKey: params.idempotencyKey,
      source: { type: "wallet", id: "merchant" },
      destination: {
        type: destType,
        id: params.destinationBankAccountId,
      },
      amount: params.amount,
      metadata: params.metadata ?? {},
    },
  })) as { data?: CirclePayoutResult };

  const result = body?.data;
  if (!result?.id) throw new CircleApiError(500, body);
  return result;
}

/**
 * Fetch current payout status.
 * Circle API: GET /v1/payouts/{id}
 * See: https://developers.circle.com/circle-mint/reference/getpayout
 */
export async function getPayout(payoutId: string): Promise<CirclePayoutResult> {
  const body = (await circleFetch(`/v1/payouts/${payoutId}`, {
    method: "GET",
  })) as { data?: CirclePayoutResult };

  const result = body?.data;
  if (!result?.id) throw new CircleApiError(500, body);
  return result;
}
