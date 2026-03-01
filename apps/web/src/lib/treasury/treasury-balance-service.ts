import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { ensureOrgTreasuryWallet } from "./treasury-service";
import { getSolanaConnectionForCluster } from "@/lib/solana/rpc";
import { RpcNotConfiguredError } from "@/lib/solana/rpc";

export type TreasuryBalanceToken = {
  program: "token" | "token2022";
  mint: string;
  ata: string;
  amountRaw: string;
  decimals: number;
  amount: string;
};

export type TreasuryBalancesResponse = {
  orgId: string;
  cluster: string;
  treasuryPubkey: string;
  solLamports: string;
  sol: string;
  tokens: TreasuryBalanceToken[];
  fetchedAt: string;
};

export function formatTokenAmount(amountRaw: string, decimals: number): string {
  const raw = BigInt(amountRaw);
  if (raw === BigInt(0)) return "0";
  const divisor = BigInt(10 ** decimals);
  const intPart = raw / divisor;
  const fracPart = raw % divisor;
  if (fracPart === BigInt(0)) return intPart.toString();
  const fracStr = fracPart.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${intPart}.${fracStr}`;
}

export async function getOrgTreasuryBalances(
  orgId: string
): Promise<TreasuryBalancesResponse> {
  const wallet = await ensureOrgTreasuryWallet(orgId);
  const cluster = wallet.cluster;
  const pubkey = new PublicKey(wallet.treasuryPubkey);

  let connection;
  try {
    connection = getSolanaConnectionForCluster(cluster);
  } catch {
    throw new RpcNotConfiguredError();
  }

  const [solBalance, tokenAccountsSp, tokenAccounts2022] = await Promise.all([
    connection.getBalance(pubkey),
    connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: TOKEN_PROGRAM_ID,
    }),
    connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: TOKEN_2022_PROGRAM_ID,
    }),
  ]);

  const tokens: TreasuryBalanceToken[] = [];

  for (const { pubkey: ataPubkey, account } of tokenAccountsSp.value) {
    const info = account.data?.parsed?.info;
    if (!info?.mint || info?.tokenAmount === undefined) continue;
    const amountRaw = info.tokenAmount.amount ?? "0";
    const decimals = info.tokenAmount.decimals ?? 0;
    tokens.push({
      program: "token",
      mint: info.mint,
      ata: ataPubkey.toBase58(),
      amountRaw,
      decimals,
      amount: formatTokenAmount(amountRaw, decimals),
    });
  }

  for (const { pubkey: ataPubkey, account } of tokenAccounts2022.value) {
    const info = account.data?.parsed?.info;
    if (!info?.mint || info?.tokenAmount === undefined) continue;
    const amountRaw = info.tokenAmount.amount ?? "0";
    const decimals = info.tokenAmount.decimals ?? 0;
    tokens.push({
      program: "token2022",
      mint: info.mint,
      ata: ataPubkey.toBase58(),
      amountRaw,
      decimals,
      amount: formatTokenAmount(amountRaw, decimals),
    });
  }

  const solLamports = solBalance.toString();
  const sol = formatTokenAmount(solLamports, 9);

  return {
    orgId: wallet.orgId,
    cluster,
    treasuryPubkey: wallet.treasuryPubkey,
    solLamports,
    sol,
    tokens,
    fetchedAt: new Date().toISOString(),
  };
}
