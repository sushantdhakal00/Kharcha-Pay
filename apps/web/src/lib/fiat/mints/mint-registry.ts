import { TreasuryChain } from "@prisma/client";

export class MintNotFoundError extends Error {
  code = "MINT_NOT_FOUND" as const;
}

interface MintRow {
  id: string;
  chain: TreasuryChain;
  symbol: string;
  mintAddress: string;
  decimals: number;
  isActive: boolean;
  createdAt: Date;
}

type PrismaLike = {
  treasuryMintRegistry: {
    findFirst: (args: {
      where: Record<string, unknown>;
    }) => Promise<MintRow | null>;
    findMany: (args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }) => Promise<MintRow[]>;
  };
};

export async function getMintByAddress(
  db: PrismaLike,
  chain: TreasuryChain,
  mintAddress: string
): Promise<MintRow | null> {
  return db.treasuryMintRegistry.findFirst({
    where: { chain, mintAddress, isActive: true },
  });
}

export async function getMintBySymbol(
  db: PrismaLike,
  chain: TreasuryChain,
  symbol: string
): Promise<MintRow | null> {
  return db.treasuryMintRegistry.findFirst({
    where: { chain, symbol: symbol.toUpperCase(), isActive: true },
  });
}

export async function listActiveMints(
  db: PrismaLike,
  chain: TreasuryChain
): Promise<MintRow[]> {
  return db.treasuryMintRegistry.findMany({
    where: { chain, isActive: true },
    orderBy: { symbol: "asc" },
  });
}

export async function requireMintInRegistry(
  db: PrismaLike,
  chain: TreasuryChain,
  mintAddress: string
): Promise<MintRow> {
  const mint = await getMintByAddress(db, chain, mintAddress);
  if (!mint) {
    throw new MintNotFoundError(
      `Mint ${mintAddress} on chain ${chain} is not registered or inactive. ` +
        "Register the mint in the Treasury Mint Registry before proceeding."
    );
  }
  return mint;
}

export function parseFundingDestination(fundingJson: Record<string, unknown>): {
  chain: TreasuryChain;
  mintAddress: string;
  destinationAddress: string;
  amount: string;
  tokenProgram?: string;
} {
  const chain = (fundingJson.chain as string) ?? "SOLANA";
  const normalizedChain =
    chain.toLowerCase() === "sol" || chain.toLowerCase() === "solana"
      ? TreasuryChain.SOLANA
      : (chain.toUpperCase() as TreasuryChain);

  return {
    chain: normalizedChain,
    mintAddress: fundingJson.mint as string,
    destinationAddress: fundingJson.address as string,
    amount: fundingJson.amount as string,
    tokenProgram: fundingJson.tokenProgram as string | undefined,
  };
}
