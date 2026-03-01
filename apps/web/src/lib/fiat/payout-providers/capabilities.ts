import { PayoutMethodType } from "@prisma/client";

export interface ProviderFeatureFlags {
  ach?: boolean;
  local?: boolean;
  wire?: boolean;
  fx?: boolean;
  fees?: boolean;
}

export interface ProviderCapability {
  provider: string;
  supportedRails: PayoutMethodType[];
  supportedCurrencies: string[];
  requiresOnChainFunding: boolean;
  supportsRecipientManagement: boolean;
  features: ProviderFeatureFlags;
}

export class UnsupportedRailError extends Error {
  code = "UNSUPPORTED_RAIL" as const;
  constructor(
    public provider: string,
    public rail: string,
    public currency: string
  ) {
    super(
      `Rail "${rail}" with currency "${currency}" is not supported by provider "${provider}"`
    );
    this.name = "UnsupportedRailError";
  }
}

export class UnsupportedCurrencyError extends Error {
  code = "UNSUPPORTED_CURRENCY" as const;
  constructor(
    public provider: string,
    public currency: string
  ) {
    super(
      `Currency "${currency}" is not supported by provider "${provider}"`
    );
    this.name = "UnsupportedCurrencyError";
  }
}

function envFlag(name: string, fallback: boolean = false): boolean {
  const val = process.env[name];
  if (val === undefined || val === "") return fallback;
  return val === "true" || val === "1";
}

export function isAchEnabled(): boolean {
  return envFlag("ENABLE_ACH_PAYOUTS", false);
}

export function isLocalEnabled(): boolean {
  return envFlag("ENABLE_LOCAL_PAYOUTS", false);
}

function buildCircleCapabilities(): ProviderCapability {
  const rails: PayoutMethodType[] = [PayoutMethodType.BANK_WIRE];
  const features: ProviderFeatureFlags = { wire: true, ach: false, local: false };

  if (isAchEnabled()) {
    rails.push(PayoutMethodType.ACH);
    features.ach = true;
  }
  if (isLocalEnabled()) {
    rails.push(PayoutMethodType.LOCAL);
    features.local = true;
  }

  return {
    provider: "CIRCLE",
    supportedRails: rails,
    supportedCurrencies: ["USD"],
    requiresOnChainFunding: true,
    supportsRecipientManagement: true,
    features,
  };
}

const STATIC_CAPABILITIES: Record<string, () => ProviderCapability> = {
  CIRCLE: buildCircleCapabilities,
};

export function getProviderCapabilities(provider: string): ProviderCapability {
  const key = provider.toUpperCase();
  const builder = STATIC_CAPABILITIES[key];
  if (!builder) {
    return {
      provider: key,
      supportedRails: [],
      supportedCurrencies: [],
      requiresOnChainFunding: false,
      supportsRecipientManagement: false,
      features: {},
    };
  }
  return builder();
}

export function isRailSupported(
  provider: string,
  rail: PayoutMethodType,
  currency: string
): boolean {
  const cap = getProviderCapabilities(provider);
  return (
    cap.supportedRails.includes(rail) &&
    cap.supportedCurrencies.includes(currency.toUpperCase())
  );
}

export type RailDisabledReason =
  | "FEATURE_FLAG_OFF"
  | "NOT_SUPPORTED_BY_PROVIDER"
  | "DISABLED_BY_POLICY"
  | null;

export function getRailDisabledReason(
  provider: string,
  rail: PayoutMethodType,
  currency: string,
  policyAllowedRails?: string[]
): RailDisabledReason {
  if (rail === PayoutMethodType.ACH && !isAchEnabled()) {
    return "FEATURE_FLAG_OFF";
  }
  if (rail === PayoutMethodType.LOCAL && !isLocalEnabled()) {
    return "FEATURE_FLAG_OFF";
  }

  const cap = getProviderCapabilities(provider);
  if (
    !cap.supportedRails.includes(rail) ||
    !cap.supportedCurrencies.includes(currency.toUpperCase())
  ) {
    return "NOT_SUPPORTED_BY_PROVIDER";
  }

  if (
    policyAllowedRails &&
    policyAllowedRails.length > 0 &&
    !policyAllowedRails.includes(rail)
  ) {
    return "DISABLED_BY_POLICY";
  }

  return null;
}

export const RAIL_DISABLED_MESSAGES: Record<string, string> = {
  FEATURE_FLAG_OFF: "Feature flag off",
  NOT_SUPPORTED_BY_PROVIDER: "Not supported by provider",
  DISABLED_BY_POLICY: "Disabled by policy",
};
