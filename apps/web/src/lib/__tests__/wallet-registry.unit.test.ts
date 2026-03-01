import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getActiveWallet,
  listActiveWallets,
  resolveFundingWalletForPayout,
  assertWalletSpendPolicy,
  getSpendPolicy,
  WalletNotFoundError,
  SpendPolicyViolationError,
} from "../fiat/wallets/wallet-registry";

function makeWallet(overrides: Partial<{
  id: string; orgId: string; name: string; type: string;
  chain: string; address: string; isActive: boolean; metadata: unknown; createdAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? "w1",
    orgId: overrides.orgId ?? "org1",
    name: overrides.name ?? "Main Hot",
    type: overrides.type ?? "HOT",
    chain: overrides.chain ?? "SOLANA",
    address: overrides.address ?? "HotAddrXYZ1234567890abcdefgh",
    isActive: overrides.isActive ?? true,
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? new Date(),
  };
}

function makeMockDb(opts: {
  wallets?: ReturnType<typeof makeWallet>[];
  spendPolicy?: { maxHotTransferMinor: bigint; requireApprovalOverMinor: bigint; dailyHotCapMinor: bigint } | null;
  dailySum?: bigint;
} = {}) {
  const wallets = opts.wallets ?? [];
  return {
    treasuryWallet: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return wallets.find(
          (w) =>
            w.orgId === where.orgId &&
            w.type === where.type &&
            w.isActive === where.isActive
        ) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return wallets.filter(
          (w) => w.orgId === where.orgId && w.isActive === where.isActive
        );
      }),
    },
    treasurySpendPolicy: {
      findUnique: vi.fn(async () => {
        if (opts.spendPolicy === null) return null;
        return opts.spendPolicy
          ? { id: "sp1", orgId: "org1", ...opts.spendPolicy, createdAt: new Date(), updatedAt: new Date() }
          : null;
      }),
    },
    treasuryPayoutIntent: {
      aggregate: vi.fn(async () => ({
        _sum: { amountMinor: opts.dailySum ?? 0n },
        _count: { id: 0 },
      })),
    },
  };
}

describe("wallet-registry", () => {
  describe("getActiveWallet", () => {
    it("returns active wallet of given type", async () => {
      const db = makeMockDb({ wallets: [makeWallet()] });
      const w = await getActiveWallet(db as never, "org1", "HOT" as never);
      expect(w.type).toBe("HOT");
      expect(w.isActive).toBe(true);
    });

    it("throws WalletNotFoundError when no active wallet", async () => {
      const db = makeMockDb({ wallets: [] });
      await expect(getActiveWallet(db as never, "org1", "HOT" as never))
        .rejects.toThrow(WalletNotFoundError);
    });

    it("does not return inactive wallets", async () => {
      const db = makeMockDb({ wallets: [makeWallet({ isActive: false })] });
      await expect(getActiveWallet(db as never, "org1", "HOT" as never))
        .rejects.toThrow(WalletNotFoundError);
    });

    it("returns correct type when multiple exist", async () => {
      const db = makeMockDb({
        wallets: [
          makeWallet({ id: "w1", type: "HOT" }),
          makeWallet({ id: "w2", type: "WARM" }),
        ],
      });
      const w = await getActiveWallet(db as never, "org1", "WARM" as never);
      expect(w.type).toBe("WARM");
    });

    it("includes WalletNotFoundError code", async () => {
      const db = makeMockDb();
      try {
        await getActiveWallet(db as never, "org1", "OPERATIONAL" as never);
      } catch (e) {
        expect((e as WalletNotFoundError).code).toBe("WALLET_NOT_FOUND");
      }
    });
  });

  describe("listActiveWallets", () => {
    it("returns all active wallets for org", async () => {
      const db = makeMockDb({
        wallets: [
          makeWallet({ id: "w1", type: "HOT" }),
          makeWallet({ id: "w2", type: "OPERATIONAL" }),
        ],
      });
      const list = await listActiveWallets(db as never, "org1");
      expect(list).toHaveLength(2);
    });

    it("returns empty array when no wallets", async () => {
      const db = makeMockDb({ wallets: [] });
      const list = await listActiveWallets(db as never, "org1");
      expect(list).toHaveLength(0);
    });
  });

  describe("resolveFundingWalletForPayout", () => {
    it("prefers HOT wallet", async () => {
      const db = makeMockDb({
        wallets: [
          makeWallet({ id: "w1", type: "HOT" }),
          makeWallet({ id: "w2", type: "OPERATIONAL" }),
        ],
      });
      const w = await resolveFundingWalletForPayout(db as never, "org1");
      expect(w.type).toBe("HOT");
    });

    it("falls back to OPERATIONAL when no HOT", async () => {
      const db = makeMockDb({
        wallets: [makeWallet({ id: "w2", type: "OPERATIONAL" })],
      });
      const w = await resolveFundingWalletForPayout(db as never, "org1");
      expect(w.type).toBe("OPERATIONAL");
    });

    it("throws when no wallets at all", async () => {
      const db = makeMockDb({ wallets: [] });
      await expect(resolveFundingWalletForPayout(db as never, "org1"))
        .rejects.toThrow(WalletNotFoundError);
    });

    it("accepts optional intent parameter", async () => {
      const db = makeMockDb({ wallets: [makeWallet()] });
      const w = await resolveFundingWalletForPayout(db as never, "org1", {
        amountMinor: 100000n,
      });
      expect(w).toBeDefined();
    });
  });

  describe("getSpendPolicy", () => {
    it("returns defaults when no policy exists", async () => {
      const db = makeMockDb({ spendPolicy: null });
      const p = await getSpendPolicy(db as never, "org1");
      expect(p.maxHotTransferMinor).toBe(500_000n);
      expect(p.requireApprovalOverMinor).toBe(1_000_000n);
      expect(p.dailyHotCapMinor).toBe(5_000_000n);
    });

    it("returns custom policy when set", async () => {
      const db = makeMockDb({
        spendPolicy: {
          maxHotTransferMinor: 100_000n,
          requireApprovalOverMinor: 200_000n,
          dailyHotCapMinor: 300_000n,
        },
      });
      const p = await getSpendPolicy(db as never, "org1");
      expect(p.maxHotTransferMinor).toBe(100_000n);
      expect(p.requireApprovalOverMinor).toBe(200_000n);
      expect(p.dailyHotCapMinor).toBe(300_000n);
    });
  });

  describe("assertWalletSpendPolicy", () => {
    it("allows transfer under max hot limit", async () => {
      const db = makeMockDb({ spendPolicy: null, dailySum: 0n });
      const result = await assertWalletSpendPolicy(db as never, "org1", 100_000n, "HOT" as never);
      expect(result.requiresApproval).toBe(false);
    });

    it("throws SpendPolicyViolationError for transfer over max hot limit", async () => {
      const db = makeMockDb({
        spendPolicy: { maxHotTransferMinor: 100_000n, requireApprovalOverMinor: 1_000_000n, dailyHotCapMinor: 5_000_000n },
        dailySum: 0n,
      });
      await expect(assertWalletSpendPolicy(db as never, "org1", 200_000n, "HOT" as never))
        .rejects.toThrow(SpendPolicyViolationError);
    });

    it("throws when daily hot cap exceeded", async () => {
      const db = makeMockDb({
        spendPolicy: { maxHotTransferMinor: 10_000_000n, requireApprovalOverMinor: 100_000_000n, dailyHotCapMinor: 1_000_000n },
        dailySum: 900_000n,
      });
      await expect(assertWalletSpendPolicy(db as never, "org1", 200_000n, "HOT" as never))
        .rejects.toThrow(SpendPolicyViolationError);
    });

    it("requires approval for amounts over threshold", async () => {
      const db = makeMockDb({
        spendPolicy: { maxHotTransferMinor: 10_000_000n, requireApprovalOverMinor: 50_000n, dailyHotCapMinor: 50_000_000n },
        dailySum: 0n,
      });
      const result = await assertWalletSpendPolicy(db as never, "org1", 100_000n, "HOT" as never);
      expect(result.requiresApproval).toBe(true);
      expect(result.reason).toBe("ONCHAIN_SPEND_APPROVAL_REQUIRED");
    });

    it("does not check daily cap for non-HOT wallets", async () => {
      const db = makeMockDb({
        spendPolicy: { maxHotTransferMinor: 10n, requireApprovalOverMinor: 100_000_000n, dailyHotCapMinor: 10n },
        dailySum: 100n,
      });
      const result = await assertWalletSpendPolicy(db as never, "org1", 500n, "OPERATIONAL" as never);
      expect(result.requiresApproval).toBe(false);
    });

    it("SpendPolicyViolationError has correct code", async () => {
      const db = makeMockDb({
        spendPolicy: { maxHotTransferMinor: 10n, requireApprovalOverMinor: 100_000_000n, dailyHotCapMinor: 100_000_000n },
        dailySum: 0n,
      });
      try {
        await assertWalletSpendPolicy(db as never, "org1", 500n, "HOT" as never);
      } catch (e) {
        expect((e as SpendPolicyViolationError).code).toBe("SPEND_POLICY_VIOLATION");
      }
    });

    it("uses default limits when no policy configured", async () => {
      const db = makeMockDb({ spendPolicy: null, dailySum: 0n });
      const result = await assertWalletSpendPolicy(db as never, "org1", 100_000n, "HOT" as never);
      expect(result.requiresApproval).toBe(false);
    });
  });
});
