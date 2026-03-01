import { TreasuryRiskStatus, Prisma, PayoutMethodType } from "@prisma/client";
import { isRailSupported, getRailDisabledReason } from "./payout-providers/capabilities";

// ---- Types ----

export interface TreasuryPolicyRules {
  dailyLimitMinor?: number;
  weeklyLimitMinor?: number;
  monthlyLimitMinor?: number;
  perVendorDailyLimitMinor?: number;
  maxPayoutsPerDay?: number;
  maxPayoutsPerVendorPerDay?: number;
  requireApprovalOverMinor?: number;
  allowedRails?: string[];
  allowedProviders?: string[];
  vendorAllowlist?: string[];
  countryAllowlist?: string[];
}

export interface PolicyEvaluationInput {
  amountMinor: bigint | number;
  currency: string;
  vendorId?: string | null;
  payoutRail: string;
  provider: string;
  vendorCountry?: string | null;
}

export interface HistoricalStats {
  orgDailyAmountMinor: number;
  orgWeeklyAmountMinor: number;
  orgMonthlyAmountMinor: number;
  orgDailyCount: number;
  vendorDailyAmountMinor: number;
  vendorDailyCount: number;
}

export interface PolicyEvaluationResult {
  riskStatus: TreasuryRiskStatus;
  reasons: string[];
  requiresApproval: boolean;
}

export class TreasuryPolicyViolationError extends Error {
  code = "TREASURY_POLICY_VIOLATION";
  reasons: string[];
  constructor(reasons: string[]) {
    super(`Treasury policy violated: ${reasons.join("; ")}`);
    this.reasons = reasons;
  }
}

// ---- Default policy (used when no org-specific policy exists) ----

export const DEFAULT_POLICY_RULES: TreasuryPolicyRules = {
  dailyLimitMinor: 10_000_000,
  weeklyLimitMinor: 30_000_000,
  monthlyLimitMinor: 100_000_000,
  perVendorDailyLimitMinor: 2_000_000,
  maxPayoutsPerDay: 50,
  maxPayoutsPerVendorPerDay: 10,
  requireApprovalOverMinor: 500_000,
  allowedRails: ["BANK_WIRE"],
  allowedProviders: ["CIRCLE"],
};

// ---- DB accessors ----

type PrismaLike = {
  treasuryPolicy: {
    findFirst: (args: {
      where: { orgId: string; isActive: boolean };
      orderBy: { version: "desc" };
    }) => Promise<{ id: string; orgId: string; version: number; isActive: boolean; rules: unknown; createdAt: Date } | null>;
  };
  treasuryPayoutIntent: {
    aggregate: (args: unknown) => Promise<{ _sum: { amountMinor: bigint | null }; _count: { id: number } }>;
  };
};

export async function getActivePolicy(
  db: PrismaLike,
  orgId: string
): Promise<{ id: string; orgId: string; version: number; rules: TreasuryPolicyRules } | null> {
  const policy = await db.treasuryPolicy.findFirst({
    where: { orgId, isActive: true },
    orderBy: { version: "desc" },
  });
  if (!policy) return null;
  return {
    id: policy.id,
    orgId: policy.orgId,
    version: policy.version,
    rules: policy.rules as TreasuryPolicyRules,
  };
}

export function resolveRules(
  policy: { rules: TreasuryPolicyRules } | null
): TreasuryPolicyRules {
  if (!policy) return { ...DEFAULT_POLICY_RULES };
  return { ...DEFAULT_POLICY_RULES, ...policy.rules };
}

// ---- Historical stats computation ----

export async function computeHistoricalStats(
  db: PrismaLike,
  orgId: string,
  vendorId: string | null | undefined,
  now: Date = new Date()
): Promise<HistoricalStats> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(now);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const excludeStatuses = ["FAILED", "CANCELED"];

  const orgDailyAgg = await db.treasuryPayoutIntent.aggregate({
    where: {
      orgId,
      createdAt: { gte: startOfDay },
      status: { notIn: excludeStatuses },
    } as unknown,
    _sum: { amountMinor: true },
    _count: { id: true },
  } as unknown);

  const orgWeeklyAgg = await db.treasuryPayoutIntent.aggregate({
    where: {
      orgId,
      createdAt: { gte: startOfWeek },
      status: { notIn: excludeStatuses },
    } as unknown,
    _sum: { amountMinor: true },
    _count: { id: true },
  } as unknown);

  const orgMonthlyAgg = await db.treasuryPayoutIntent.aggregate({
    where: {
      orgId,
      createdAt: { gte: startOfMonth },
      status: { notIn: excludeStatuses },
    } as unknown,
    _sum: { amountMinor: true },
    _count: { id: true },
  } as unknown);

  let vendorDailyAmountMinor = 0;
  let vendorDailyCount = 0;
  if (vendorId) {
    const vendorAgg = await db.treasuryPayoutIntent.aggregate({
      where: {
        orgId,
        vendorId,
        createdAt: { gte: startOfDay },
        status: { notIn: excludeStatuses },
      } as unknown,
      _sum: { amountMinor: true },
      _count: { id: true },
    } as unknown);
    vendorDailyAmountMinor = Number(vendorAgg._sum.amountMinor ?? BigInt(0));
    vendorDailyCount = vendorAgg._count.id;
  }

  return {
    orgDailyAmountMinor: Number(orgDailyAgg._sum.amountMinor ?? BigInt(0)),
    orgWeeklyAmountMinor: Number(orgWeeklyAgg._sum.amountMinor ?? BigInt(0)),
    orgMonthlyAmountMinor: Number(orgMonthlyAgg._sum.amountMinor ?? BigInt(0)),
    orgDailyCount: orgDailyAgg._count.id,
    vendorDailyAmountMinor,
    vendorDailyCount,
  };
}

// ---- Pure policy evaluation ----

export function evaluatePayoutRisk(
  input: PolicyEvaluationInput,
  rules: TreasuryPolicyRules,
  stats: HistoricalStats
): PolicyEvaluationResult {
  const reasons: string[] = [];
  const blockReasons: string[] = [];
  const amountMinor = Number(input.amountMinor);

  const railEnum = input.payoutRail.toUpperCase() as PayoutMethodType;
  const capabilityReason = getRailDisabledReason(
    input.provider,
    railEnum,
    input.currency,
    rules.allowedRails
  );
  if (capabilityReason === "FEATURE_FLAG_OFF") {
    blockReasons.push(
      `Rail "${input.payoutRail}" is disabled: feature flag is off`
    );
  } else if (capabilityReason === "NOT_SUPPORTED_BY_PROVIDER") {
    blockReasons.push(
      `Rail "${input.payoutRail}" is not supported by provider "${input.provider}"`
    );
  } else if (capabilityReason === "DISABLED_BY_POLICY") {
    blockReasons.push(
      `Rail "${input.payoutRail}" is not allowed. Allowed: ${rules.allowedRails?.join(", ") ?? "none"}`
    );
  }

  if (rules.allowedProviders && rules.allowedProviders.length > 0) {
    if (!rules.allowedProviders.includes(input.provider.toUpperCase())) {
      blockReasons.push(`Provider "${input.provider}" is not allowed. Allowed: ${rules.allowedProviders.join(", ")}`);
    }
  }

  if (
    !capabilityReason &&
    rules.allowedRails &&
    rules.allowedRails.length > 0
  ) {
    if (!rules.allowedRails.includes(input.payoutRail.toUpperCase())) {
      blockReasons.push(`Rail "${input.payoutRail}" is not allowed. Allowed: ${rules.allowedRails.join(", ")}`);
    }
  }

  if (rules.vendorAllowlist && rules.vendorAllowlist.length > 0) {
    if (!input.vendorId || !rules.vendorAllowlist.includes(input.vendorId)) {
      blockReasons.push("Vendor is not on the allowlist");
    }
  }

  if (rules.countryAllowlist && rules.countryAllowlist.length > 0 && input.vendorCountry) {
    if (!rules.countryAllowlist.includes(input.vendorCountry.toUpperCase())) {
      blockReasons.push(`Country "${input.vendorCountry}" is not on the allowlist. Allowed: ${rules.countryAllowlist.join(", ")}`);
    }
  }

  if (rules.dailyLimitMinor != null) {
    const projectedDaily = stats.orgDailyAmountMinor + amountMinor;
    if (projectedDaily > rules.dailyLimitMinor) {
      blockReasons.push(`Org daily limit exceeded: projected ${projectedDaily} > limit ${rules.dailyLimitMinor}`);
    }
  }

  if (rules.weeklyLimitMinor != null) {
    const projectedWeekly = stats.orgWeeklyAmountMinor + amountMinor;
    if (projectedWeekly > rules.weeklyLimitMinor) {
      blockReasons.push(`Org weekly limit exceeded: projected ${projectedWeekly} > limit ${rules.weeklyLimitMinor}`);
    }
  }

  if (rules.monthlyLimitMinor != null) {
    const projectedMonthly = stats.orgMonthlyAmountMinor + amountMinor;
    if (projectedMonthly > rules.monthlyLimitMinor) {
      blockReasons.push(`Org monthly limit exceeded: projected ${projectedMonthly} > limit ${rules.monthlyLimitMinor}`);
    }
  }

  if (rules.perVendorDailyLimitMinor != null && input.vendorId) {
    const projectedVendor = stats.vendorDailyAmountMinor + amountMinor;
    if (projectedVendor > rules.perVendorDailyLimitMinor) {
      blockReasons.push(`Vendor daily limit exceeded: projected ${projectedVendor} > limit ${rules.perVendorDailyLimitMinor}`);
    }
  }

  if (rules.maxPayoutsPerDay != null) {
    const projectedCount = stats.orgDailyCount + 1;
    if (projectedCount > rules.maxPayoutsPerDay) {
      blockReasons.push(`Org daily payout count exceeded: ${projectedCount} > limit ${rules.maxPayoutsPerDay}`);
    }
  }

  if (rules.maxPayoutsPerVendorPerDay != null && input.vendorId) {
    const projectedVendorCount = stats.vendorDailyCount + 1;
    if (projectedVendorCount > rules.maxPayoutsPerVendorPerDay) {
      blockReasons.push(`Vendor daily payout count exceeded: ${projectedVendorCount} > limit ${rules.maxPayoutsPerVendorPerDay}`);
    }
  }

  if (blockReasons.length > 0) {
    return {
      riskStatus: TreasuryRiskStatus.BLOCKED,
      reasons: blockReasons,
      requiresApproval: false,
    };
  }

  if (rules.requireApprovalOverMinor != null && amountMinor > rules.requireApprovalOverMinor) {
    reasons.push(`Amount ${amountMinor} exceeds approval threshold ${rules.requireApprovalOverMinor}`);
  }

  if (reasons.length > 0) {
    return {
      riskStatus: TreasuryRiskStatus.REQUIRES_APPROVAL,
      reasons,
      requiresApproval: true,
    };
  }

  return {
    riskStatus: TreasuryRiskStatus.CLEAR,
    reasons: [],
    requiresApproval: false,
  };
}

// ---- Enforcement helper ----

export function enforcePayoutPolicyOrThrow(
  result: PolicyEvaluationResult
): void {
  if (result.riskStatus === TreasuryRiskStatus.BLOCKED) {
    throw new TreasuryPolicyViolationError(result.reasons);
  }
}
