import { TreasuryChain, TreasuryWalletType } from "@prisma/client";
import { env } from "@/lib/env";
import type {
  ObservedBalanceAdapter,
  ObservedBalance,
} from "./treasury-reconciliation";

interface MintRow {
  mintAddress: string;
  symbol: string;
  decimals: number;
}

interface WalletRow {
  address: string;
  type: TreasuryWalletType;
  name: string;
}

type PrismaLike = {
  treasuryMintRegistry: {
    findMany: (args: { where: Record<string, unknown> }) => Promise<MintRow[]>;
  };
  treasuryWallet: {
    findMany: (args: { where: Record<string, unknown> }) => Promise<WalletRow[]>;
  };
};

export interface SolanaRpcClient {
  getTokenAccountBalance(
    walletAddress: string,
    mintAddress: string
  ): Promise<{ amount: string; decimals: number } | null>;
}

export class JsonRpcSolanaClient implements SolanaRpcClient {
  constructor(private rpcUrl: string) {}

  async getTokenAccountBalance(
    walletAddress: string,
    mintAddress: string
  ): Promise<{ amount: string; decimals: number } | null> {
    try {
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const { getAssociatedTokenAddress } = await import("@solana/spl-token");

      const connection = new Connection(this.rpcUrl, "confirmed");
      const walletPk = new PublicKey(walletAddress);
      const mintPk = new PublicKey(mintAddress);
      const ata = await getAssociatedTokenAddress(mintPk, walletPk);

      const bal = await connection.getTokenAccountBalance(ata);
      return {
        amount: bal.value.amount,
        decimals: bal.value.decimals,
      };
    } catch {
      return null;
    }
  }
}

export class MockSolanaRpcClient implements SolanaRpcClient {
  private balances = new Map<string, { amount: string; decimals: number }>();

  setBalance(walletAddress: string, mintAddress: string, amount: string, decimals: number) {
    this.balances.set(`${walletAddress}:${mintAddress}`, { amount, decimals });
  }

  async getTokenAccountBalance(
    walletAddress: string,
    mintAddress: string
  ): Promise<{ amount: string; decimals: number } | null> {
    return this.balances.get(`${walletAddress}:${mintAddress}`) ?? null;
  }
}

export class SolanaTokenBalanceAdapter implements ObservedBalanceAdapter {
  readonly name = "solana-token-balance";

  constructor(
    private db: PrismaLike,
    private rpc: SolanaRpcClient
  ) {}

  async fetchObservedBalances(orgId: string): Promise<ObservedBalance[]> {
    const wallets = await this.db.treasuryWallet.findMany({
      where: { orgId, isActive: true, chain: TreasuryChain.SOLANA },
    });

    const mints = await this.db.treasuryMintRegistry.findMany({
      where: { chain: TreasuryChain.SOLANA, isActive: true },
    });

    if (wallets.length === 0 || mints.length === 0) return [];

    const results: ObservedBalance[] = [];

    for (const wallet of wallets) {
      for (const mint of mints) {
        const bal = await this.rpc.getTokenAccountBalance(
          wallet.address,
          mint.mintAddress
        );
        if (!bal) continue;

        const account =
          wallet.type === TreasuryWalletType.HOT
            ? "TREASURY_WALLET"
            : wallet.type === TreasuryWalletType.OPERATIONAL
              ? "PROVIDER_WALLET"
              : "TREASURY_WALLET";

        results.push({
          account,
          currency: mint.symbol.toUpperCase(),
          source: "ONCHAIN",
          balanceMinor: BigInt(bal.amount),
        });
      }
    }

    return results;
  }
}

export function createOnChainAdapter(db: PrismaLike): ObservedBalanceAdapter {
  const enabled =
    env.ENABLE_ONCHAIN_RECONCILIATION === "true" ||
    env.ENABLE_ONCHAIN_RECONCILIATION === "1";
  const rpcUrl = env.SOLANA_RPC_URL;

  if (!enabled || !rpcUrl) {
    const { NoopOnChainAdapter } = require("./treasury-reconciliation");
    return new NoopOnChainAdapter();
  }

  const rpc = new JsonRpcSolanaClient(rpcUrl);
  return new SolanaTokenBalanceAdapter(db, rpc);
}
