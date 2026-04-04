import { describe, it, expect, vi } from "vitest";
import {
  assertWalletSpendPolicy,
  SpendPolicyViolationError,
  getSpendPolicy,
} from "../fiat/wallets/wallet-registry";
import { assertNotWarmWallet, WarmKeyAccessError } from "../fiat/wallets/signing";
import {
  emitTreasuryEvent,
  onchainTransferBlockedDedupKey,
  walletDedupKey,
  mintDedupKey,
  spendPolicyDedupKey,
} from "../fiat/treasury-events";

function makeMockDb(opts: {
  maxHot?: bigint;
  approvalOver?: bigint;
  dailyCap?: bigint;
  dailySum?: bigint;
} = {}) {
  return {
    treasuryWallet: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    treasurySpendPolicy: {
      findUnique: vi.fn(async () =>
        opts.maxHot
          ? {
              id: "sp1",
              orgId: "org1",
              maxHotTransferMinor: opts.maxHot,
              requireApprovalOverMinor: opts.approvalOver ?? 1_000_000n,
              dailyHotCapMinor: opts.dailyCap ?? 5_000_000n,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : null
      ),
    },
    treasuryPayoutIntent: {
      aggregate: vi.fn(async () => ({
        _sum: { amountMinor: opts.dailySum ?? 0n },
        _count: { id: 0 },
      })),
    },
  };
}

describe("onchain-approval-gating", () => {
  describe("spend policy enforcement flow", () => {
    it("small transfer passes without approval", async () => {
      const db = makeMockDb({ maxHot: 1_000_000n, approvalOver: 500_000n });
      const result = await assertWalletSpendPolicy(db as never, "org1", 100_000n, "HOT" as never);
      expect(result.requiresApproval).toBe(false);
    });

    it("medium transfer requires approval", async () => {
      const db = makeMockDb({ maxHot: 1_000_000n, approvalOver: 500_000n });
      const result = await assertWalletSpendPolicy(db as never, "org1", 600_000n, "HOT" as never);
      expect(result.requiresApproval).toBe(true);
      expect(result.reason).toBe("ONCHAIN_SPEND_APPROVAL_REQUIRED");
    });

    it("large transfer exceeding max hot throws", async () => {
      const db = makeMockDb({ maxHot: 500_000n, approvalOver: 200_000n });
      await expect(
        assertWalletSpendPolicy(db as never, "org1", 600_000n, "HOT" as never)
      ).rejects.toThrow(SpendPolicyViolationError);
    });

    it("daily cap enforcement blocks when exceeded", async () => {
      const db = makeMockDb({
        maxHot: 10_000_000n,
        approvalOver: 10_000_000n,
        dailyCap: 1_000_000n,
        dailySum: 900_000n,
      });
      await expect(
        assertWalletSpendPolicy(db as never, "org1", 200_000n, "HOT" as never)
      ).rejects.toThrow(SpendPolicyViolationError);
    });

    it("daily cap allows when under limit", async () => {
      const db = makeMockDb({
        maxHot: 10_000_000n,
        approvalOver: 10_000_000n,
        dailyCap: 2_000_000n,
        dailySum: 500_000n,
      });
      const result = await assertWalletSpendPolicy(db as never, "org1", 200_000n, "HOT" as never);
      expect(result.requiresApproval).toBe(false);
    });
  });

  describe("warm wallet key isolation in approval flow", () => {
    it("WARM wallet cannot sign", () => {
      expect(() => assertNotWarmWallet("WARM" as never)).toThrow(WarmKeyAccessError);
    });

    it("HOT wallet can proceed after approval", () => {
      expect(() => assertNotWarmWallet("HOT" as never)).not.toThrow();
    });
  });

  describe("event dedup keys", () => {
    it("onchainTransferBlockedDedupKey is unique per intent", () => {
      const k1 = onchainTransferBlockedDedupKey("intent1");
      const k2 = onchainTransferBlockedDedupKey("intent2");
      expect(k1).not.toBe(k2);
      expect(k1).toContain("intent1");
    });

    it("walletDedupKey includes wallet id and action", () => {
      const key = walletDedupKey("w1", "created");
      expect(key).toContain("w1");
      expect(key).toContain("created");
    });

    it("mintDedupKey includes mint id and action", () => {
      const key = mintDedupKey("m1", "updated");
      expect(key).toContain("m1");
      expect(key).toContain("updated");
    });

    it("spendPolicyDedupKey includes orgId", () => {
      const key = spendPolicyDedupKey("org1");
      expect(key).toContain("org1");
      expect(key).toContain("spend-policy");
    });

    it("spendPolicyDedupKey includes timestamp", () => {
      const key = spendPolicyDedupKey("org1");
      expect(key).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe("policy defaults", () => {
    it("returns correct defaults when no policy", async () => {
      const db = makeMockDb({});
      const policy = await getSpendPolicy(db as never, "org1");
      expect(policy.maxHotTransferMinor).toBe(500_000n);
      expect(policy.requireApprovalOverMinor).toBe(1_000_000n);
      expect(policy.dailyHotCapMinor).toBe(5_000_000n);
    });
  });

  describe("operational wallet bypass", () => {
    it("OPERATIONAL wallet skips hot-specific checks", async () => {
      const db = makeMockDb({
        maxHot: 100n,
        dailyCap: 100n,
        dailySum: 1000n,
        approvalOver: 50_000_000n,
      });
      const result = await assertWalletSpendPolicy(db as never, "org1", 5000n, "OPERATIONAL" as never);
      expect(result.requiresApproval).toBe(false);
    });

    it("WARM wallet skips hot-specific checks", async () => {
      const db = makeMockDb({
        maxHot: 100n,
        dailyCap: 100n,
        dailySum: 1000n,
        approvalOver: 50_000_000n,
      });
      const result = await assertWalletSpendPolicy(db as never, "org1", 5000n, "WARM" as never);
      expect(result.requiresApproval).toBe(false);
    });
  });
});
