import type { PayoutProvider } from "./types";
import { CircleProvider } from "./circle/circle-provider";

export type { PayoutProvider } from "./types";
export {
  ProviderError,
  type ProviderPayoutStatus,
  type ProviderErrorClassification,
  type ProviderRecipientRef,
  type ProviderPayoutRef,
  type ProviderPayoutStatusResult,
  type RecipientProfileInput,
  type PayoutInput,
} from "./types";

const providerRegistry = new Map<string, PayoutProvider>();

function ensureRegistered() {
  if (providerRegistry.size === 0) {
    providerRegistry.set("CIRCLE", new CircleProvider());
  }
}

export function getPayoutProvider(providerName: string): PayoutProvider {
  ensureRegistered();
  const provider = providerRegistry.get(providerName.toUpperCase());
  if (!provider) {
    throw new Error(
      `Unknown payout provider: ${providerName}. Available: ${[...providerRegistry.keys()].join(", ")}`
    );
  }
  return provider;
}

export function listPayoutProviders(): string[] {
  ensureRegistered();
  return [...providerRegistry.keys()];
}

export function registerPayoutProvider(
  name: string,
  provider: PayoutProvider
): void {
  providerRegistry.set(name.toUpperCase(), provider);
}
