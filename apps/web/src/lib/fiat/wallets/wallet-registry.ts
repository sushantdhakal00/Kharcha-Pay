import { TreasuryWalletType, TreasuryChain } from "@prisma/client";

export class WalletNotFoundError extends Error {
  code = "WALLET_NOT_FOUND" as const;
}

export class SpendPolicyViolationError extends Error {
  code = "SPEND_POLICY_VIOLATION" as const;
  requiresApproval: boolean;
  constructor(message: string, requiresApproval = false) {
    super(message);
    this.requiresApproval = requiresApproval;
  }
}

type PrismaLike = {
  treasuryWallet: {
    findFirst: (args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }) => Promise<TreasuryWalletRow | null>;
    findMany: (args: {
      where: Record<string, unknown>;
    }) => Promise<TreasuryWalletRow[]>;
  };
  treasurySpendPolicy: {
    findUnique: (args: {
      where: { orgId: string };
    }) => Promise<SpendPolicyRow | null>;
  };
  treasuryPayoutIntent: {
    aggregate: (args: unknown) => Promise<{
      _sum: { amountMinor: bigint | null };
      _count: { id: number };
    }>;
  };
};

interface TreasuryWalletRow {
  id: string;
  orgId: string;
  name: string;
  type: TreasuryWalletType;
  chain: TreasuryChain;
  address: string;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
}

interface SpendPolicyRow {
  id: string;
  orgId: string;
  maxHotTransferMinor: bigint;
  requireApprovalOverMinor: bigint;
  dailyHotCapMinor: bigint;
  createdAt: Date;
  updatedAt: Date;
}

export async function getActiveWallet(
  db: PrismaLike,
  orgId: string,
  type: TreasuryWalletType
): Promise<TreasuryWalletRow> {
  const wallet = await db.treasuryWallet.findFirst({
    where: { orgId, type, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!wallet) {
    throw new WalletNotFoundError(
      `No active ${type} wallet found for org ${orgId}`
    );
  }
  return wallet;
}

export async function listActiveWallets(
  db: PrismaLike,
  orgId: string
): Promise<TreasuryWalletRow[]> {
  return db.treasuryWallet.findMany({
    where: { orgId, isActive: true },
  });
}

export async function resolveFundingWalletForPayout(
  db: PrismaLike,
  orgId: string,
  _intent?: { amountMinor?: bigint }
): Promise<TreasuryWalletRow> {
  try {
    return await getActiveWallet(db, orgId, TreasuryWalletType.HOT);
  } catch {
    return getActiveWallet(db, orgId, TreasuryWalletType.OPERATIONAL);
  }
}

const DEFAULT_MAX_HOT_TRANSFER = BigInt(500000);
const DEFAULT_REQUIRE_APPROVAL = BigInt(1000000);
const DEFAULT_DAILY_HOT_CAP = BigInt(5000000);

export async function getSpendPolicy(
  db: PrismaLike,
  orgId: string
): Promise<{
  maxHotTransferMinor: bigint;
  requireApprovalOverMinor: bigint;
  dailyHotCapMinor: bigint;
}> {
  const policy = await db.treasurySpendPolicy.findUnique({
    where: { orgId },
  });
  return {
    maxHotTransferMinor: policy?.maxHotTransferMinor ?? DEFAULT_MAX_HOT_TRANSFER,
    requireApprovalOverMinor: policy?.requireApprovalOverMinor ?? DEFAULT_REQUIRE_APPROVAL,
    dailyHotCapMinor: policy?.dailyHotCapMinor ?? DEFAULT_DAILY_HOT_CAP,
  };
}

export async function assertWalletSpendPolicy(
  db: PrismaLike,
  orgId: string,
  amountMinor: bigint,
  walletType: TreasuryWalletType
): Promise<{ requiresApproval: boolean; reason?: string }> {
  const policy = await getSpendPolicy(db, orgId);

  if (walletType === TreasuryWalletType.HOT) {
    if (amountMinor > policy.maxHotTransferMinor) {
      throw new SpendPolicyViolationError(
        `Transfer amount ${amountMinor} exceeds max hot wallet transfer limit ${policy.maxHotTransferMinor}`,
        false
      );
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const dailyAgg = await db.treasuryPayoutIntent.aggregate({
      where: {
        orgId,
        createdAt: { gte: startOfDay },
        status: { notIn: ["FAILED", "CANCELED"] },
      } as unknown,
      _sum: { amountMinor: true },
      _count: { id: true },
    } as unknown);

    const dailyTotal = (dailyAgg._sum.amountMinor ?? BigInt(0)) + amountMinor;
    if (dailyTotal > policy.dailyHotCapMinor) {
      throw new SpendPolicyViolationError(
        `Daily hot wallet cap exceeded: projected ${dailyTotal} > limit ${policy.dailyHotCapMinor}`,
        false
      );
    }
  }

  if (amountMinor > policy.requireApprovalOverMinor) {
    return {
      requiresApproval: true,
      reason: "ONCHAIN_SPEND_APPROVAL_REQUIRED",
    };
  }

  return { requiresApproval: false };
}
