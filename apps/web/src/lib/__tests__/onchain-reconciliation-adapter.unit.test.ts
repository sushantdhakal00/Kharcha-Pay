import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SolanaTokenBalanceAdapter,
  MockSolanaRpcClient,
  JsonRpcSolanaClient,
} from "../fiat/onchain-adapter";
import { NoopOnChainAdapter } from "../fiat/treasury-reconciliation";

function makeMockDb(opts: {
  wallets?: Array<{ address: string; type: string; name: string }>;
  mints?: Array<{ mintAddress: string; symbol: string; decimals: number }>;
} = {}) {
  return {
    treasuryWallet: {
      findMany: vi.fn(async () => opts.wallets ?? []),
    },
    treasuryMintRegistry: {
      findMany: vi.fn(async () => opts.mints ?? []),
    },
  };
}

describe("onchain-reconciliation-adapter", () => {
  describe("MockSolanaRpcClient", () => {
    it("returns null when no balance set", async () => {
      const rpc = new MockSolanaRpcClient();
      const bal = await rpc.getTokenAccountBalance("wallet", "mint");
      expect(bal).toBeNull();
    });

    it("returns set balance", async () => {
      const rpc = new MockSolanaRpcClient();
      rpc.setBalance("w1", "m1", "1000000", 6);
      const bal = await rpc.getTokenAccountBalance("w1", "m1");
      expect(bal).toEqual({ amount: "1000000", decimals: 6 });
    });

    it("handles multiple wallets/mints independently", async () => {
      const rpc = new MockSolanaRpcClient();
      rpc.setBalance("w1", "m1", "100", 6);
      rpc.setBalance("w1", "m2", "200", 9);
      rpc.setBalance("w2", "m1", "300", 6);
      expect(await rpc.getTokenAccountBalance("w1", "m1")).toEqual({ amount: "100", decimals: 6 });
      expect(await rpc.getTokenAccountBalance("w1", "m2")).toEqual({ amount: "200", decimals: 9 });
      expect(await rpc.getTokenAccountBalance("w2", "m1")).toEqual({ amount: "300", decimals: 6 });
    });

    it("returns null for unset wallet/mint combo", async () => {
      const rpc = new MockSolanaRpcClient();
      rpc.setBalance("w1", "m1", "100", 6);
      const bal = await rpc.getTokenAccountBalance("w1", "m_other");
      expect(bal).toBeNull();
    });
  });

  describe("SolanaTokenBalanceAdapter", () => {
    it("has correct name", () => {
      const db = makeMockDb();
      const rpc = new MockSolanaRpcClient();
      const adapter = new SolanaTokenBalanceAdapter(db as never, rpc);
      expect(adapter.name).toBe("solana-token-balance");
    });

    it("returns empty when no wallets", async () => {
      const db = makeMockDb({ wallets: [], mints: [{ mintAddress: "m1", symbol: "USDC", decimals: 6 }] });
      const rpc = new MockSolanaRpcClient();
      const adapter = new SolanaTokenBalanceAdapter(db as never, rpc);
      const result = await adapter.fetchObservedBalances("org1");
      expect(result).toHaveLength(0);
    });

    it("returns empty when no mints", async () => {
      const db = makeMockDb({ wallets: [{ address: "w1", type: "HOT", name: "hot" }], mints: [] });
      const rpc = new MockSolanaRpcClient();
      const adapter = new SolanaTokenBalanceAdapter(db as never, rpc);
      const result = await adapter.fetchObservedBalances("org1");
      expect(result).toHaveLength(0);
    });

    it("fetches balances for wallet/mint combos", async () => {
      const db = makeMockDb({
        wallets: [{ address: "w1_addr", type: "HOT", name: "hot" }],
        mints: [{ mintAddress: "usdc_mint", symbol: "USDC", decimals: 6 }],
      });
      const rpc = new MockSolanaRpcClient();
      rpc.setBalance("w1_addr", "usdc_mint", "5000000", 6);
      const adapter = new SolanaTokenBalanceAdapter(db as never, rpc);
      const result = await adapter.fetchObservedBalances("org1");
      expect(result).toHaveLength(1);
      expect(result[0].balanceMinor).toBe(5000000n);
      expect(result[0].source).toBe("ONCHAIN");
      expect(result[0].currency).toBe("USDC");
    });

    it("maps HOT wallet to TREASURY_WALLET account", async () => {
      const db = makeMockDb({
        wallets: [{ address: "w1", type: "HOT", name: "hot" }],
        mints: [{ mintAddress: "m1", symbol: "USDC", decimals: 6 }],
      });
      const rpc = new MockSolanaRpcClient();
      rpc.setBalance("w1", "m1", "100", 6);
      const adapter = new SolanaTokenBalanceAdapter(db as never, rpc);
      const result = await adapter.fetchObservedBalances("org1");
      expect(result[0].account).toBe("TREASURY_WALLET");
    });

    it("maps OPERATIONAL wallet to PROVIDER_WALLET account", async () => {
      const db = makeMockDb({
        wallets: [{ address: "w1", type: "OPERATIONAL", name: "ops" }],
        mints: [{ mintAddress: "m1", symbol: "USDC", decimals: 6 }],
      });
      const rpc = new MockSolanaRpcClient();
      rpc.setBalance("w1", "m1", "100", 6);
      const adapter = new SolanaTokenBalanceAdapter(db as never, rpc);
      const result = await adapter.fetchObservedBalances("org1");
      expect(result[0].account).toBe("PROVIDER_WALLET");
    });

    it("maps WARM wallet to TREASURY_WALLET account", async () => {
      const db = makeMockDb({
        wallets: [{ address: "w1", type: "WARM", name: "warm" }],
        mints: [{ mintAddress: "m1", symbol: "USDC", decimals: 6 }],
      });
      const rpc = new MockSolanaRpcClient();
      rpc.setBalance("w1", "m1", "100", 6);
      const adapter = new SolanaTokenBalanceAdapter(db as never, rpc);
      const result = await adapter.fetchObservedBalances("org1");
      expect(result[0].account).toBe("TREASURY_WALLET");
    });

    it("skips when RPC returns null", async () => {
      const db = makeMockDb({
        wallets: [{ address: "w1", type: "HOT", name: "hot" }],
        mints: [{ mintAddress: "m1", symbol: "USDC", decimals: 6 }],
      });
      const rpc = new MockSolanaRpcClient();
      const adapter = new SolanaTokenBalanceAdapter(db as never, rpc);
      const result = await adapter.fetchObservedBalances("org1");
      expect(result).toHaveLength(0);
    });

    it("handles multiple wallets and mints", async () => {
      const db = makeMockDb({
        wallets: [
          { address: "hot1", type: "HOT", name: "hot" },
          { address: "ops1", type: "OPERATIONAL", name: "ops" },
        ],
        mints: [
          { mintAddress: "usdc", symbol: "USDC", decimals: 6 },
          { mintAddress: "usdt", symbol: "USDT", decimals: 6 },
        ],
      });
      const rpc = new MockSolanaRpcClient();
      rpc.setBalance("hot1", "usdc", "1000", 6);
      rpc.setBalance("ops1", "usdt", "2000", 6);
      const adapter = new SolanaTokenBalanceAdapter(db as never, rpc);
      const result = await adapter.fetchObservedBalances("org1");
      expect(result).toHaveLength(2);
    });
  });

  describe("NoopOnChainAdapter", () => {
    it("returns empty array", async () => {
      const adapter = new NoopOnChainAdapter();
      const result = await adapter.fetchObservedBalances("org1");
      expect(result).toEqual([]);
    });

    it("has correct name", () => {
      const adapter = new NoopOnChainAdapter();
      expect(adapter.name).toBe("noop-onchain");
    });
  });

  describe("JsonRpcSolanaClient", () => {
    it("can be instantiated with URL", () => {
      const client = new JsonRpcSolanaClient("https://api.devnet.solana.com");
      expect(client).toBeDefined();
    });
  });
});
