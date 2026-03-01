import { FiatProvider, TreasuryDepositIntentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCircleConfig } from "./circle-config";
import { createCircleCustomer, createDepositIntent, CircleApiError } from "./circle-client";

export class FiatDisabledError extends Error {
  code = "FIAT_DISABLED";
}

export class FiatProviderError extends Error {
  code = "FIAT_PROVIDER_ERROR";
}

export async function ensureCircleCustomer(
  orgId: string,
  orgName: string
): Promise<string> {
  const config = getCircleConfig();
  if (!config.enabled) throw new FiatDisabledError("Circle fiat not configured");

  const existing = await prisma.orgFiatProvider.findUnique({
    where: { orgId },
  });

  if (existing?.circleCustomerId) {
    return existing.circleCustomerId;
  }

  let id: string;
  try {
    const result = await createCircleCustomer(orgName);
    id = result.id;
  } catch (e) {
    if (e instanceof CircleApiError) {
      throw new FiatProviderError(e.message, { cause: e });
    }
    throw e;
  }

  await prisma.orgFiatProvider.upsert({
    where: { orgId },
    create: {
      orgId,
      provider: FiatProvider.CIRCLE,
      circleCustomerId: id,
    },
    update: {
      circleCustomerId: id,
    },
  });

  return id;
}

export async function createCircleDepositIntent(params: {
  orgId: string;
  orgName: string;
  amountMinor: bigint;
  currency: string;
  createdByUserId: string;
}) {
  const config = getCircleConfig();
  if (!config.enabled) throw new FiatDisabledError("Circle fiat not configured");

  const customerId = await ensureCircleCustomer(params.orgId, params.orgName);

  let circleResult;
  try {
    circleResult = await createDepositIntent({
      customerId,
      amountMinor: params.amountMinor,
      currency: params.currency,
    });
  } catch (e) {
    if (e instanceof CircleApiError) {
      throw new FiatProviderError(e.message, { cause: e });
    }
    throw e;
  }

  const intent = await prisma.treasuryDepositIntent.create({
    data: {
      orgId: params.orgId,
      provider: FiatProvider.CIRCLE,
      status: TreasuryDepositIntentStatus.CREATED,
      amountMinor: params.amountMinor,
      currency: params.currency,
      circleIntentId: circleResult.id,
      fundingInstructionsJson: (circleResult.fundingInstructions ?? {}) as object,
      hostedUrl: circleResult.hostedUrl ?? null,
      createdByUserId: params.createdByUserId,
    },
  });

  return intent;
}

