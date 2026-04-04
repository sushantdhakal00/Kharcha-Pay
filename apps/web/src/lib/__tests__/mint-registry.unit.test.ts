import { describe, it, expect, vi } from "vitest";
import {
  getMintByAddress,
  getMintBySymbol,
  listActiveMints,
  requireMintInRegistry,
  parseFundingDestination,
  MintNotFoundError,
} from "../fiat/mints/mint-registry";

function makeMint(overrides: Partial<{
  id: string; chain: string; symbol: string; mintAddress: string;
  decimals: number; isActive: boolean; createdAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? "m1",
    chain: overrides.chain ?? "SOLANA",
    symbol: overrides.symbol ?? "USDC",
    mintAddress: overrides.mintAddress ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: overrides.decimals ?? 6,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date(),
  };
}

function makeMockDb(mints: ReturnType<typeof makeMint>[] = []) {
  return {
    treasuryMintRegistry: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return mints.find((m) => {
          if (where.chain && m.chain !== where.chain) return false;
          if (where.mintAddress && m.mintAddress !== where.mintAddress) return false;
          if (where.symbol && m.symbol !== where.symbol) return false;
          if (where.isActive !== undefined && m.isActive !== where.isActive) return false;
          return true;
        }) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return mints.filter((m) => {
          if (where.chain && m.chain !== where.chain) return false;
          if (where.isActive !== undefined && m.isActive !== where.isActive) return false;
          return true;
        });
      }),
    },
  };
}

describe("mint-registry", () => {
  describe("getMintByAddress", () => {
    it("returns mint when found", async () => {
      const db = makeMockDb([makeMint()]);
      const mint = await getMintByAddress(
        db as never,
        "SOLANA" as never,
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      );
      expect(mint).not.toBeNull();
      expect(mint!.symbol).toBe("USDC");
    });

    it("returns null when not found", async () => {
      const db = makeMockDb([]);
      const mint = await getMintByAddress(db as never, "SOLANA" as never, "unknown");
      expect(mint).toBeNull();
    });

    it("filters by chain", async () => {
      const db = makeMockDb([makeMint({ chain: "SOLANA" })]);
      const mint = await getMintByAddress(db as never, "SOLANA" as never, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      expect(mint).not.toBeNull();
    });

    it("only returns active mints", async () => {
      const db = makeMockDb([makeMint({ isActive: false })]);
      const mint = await getMintByAddress(
        db as never,
        "SOLANA" as never,
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      );
      expect(mint).toBeNull();
    });
  });

  describe("getMintBySymbol", () => {
    it("returns mint by symbol", async () => {
      const db = makeMockDb([makeMint()]);
      const mint = await getMintBySymbol(db as never, "SOLANA" as never, "USDC");
      expect(mint).not.toBeNull();
    });

    it("is case-insensitive", async () => {
      const db = makeMockDb([makeMint({ symbol: "USDC" })]);
      const mint = await getMintBySymbol(db as never, "SOLANA" as never, "usdc");
      expect(db.treasuryMintRegistry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ symbol: "USDC" }) })
      );
    });

    it("returns null for unknown symbol", async () => {
      const db = makeMockDb([makeMint()]);
      const mint = await getMintBySymbol(db as never, "SOLANA" as never, "UNKNOWN");
      expect(mint).toBeNull();
    });
  });

  describe("listActiveMints", () => {
    it("returns all active mints for chain", async () => {
      const db = makeMockDb([
        makeMint({ id: "m1", symbol: "USDC" }),
        makeMint({ id: "m2", symbol: "USDT" }),
      ]);
      const list = await listActiveMints(db as never, "SOLANA" as never);
      expect(list).toHaveLength(2);
    });

    it("excludes inactive mints", async () => {
      const db = makeMockDb([
        makeMint({ id: "m1", isActive: true }),
        makeMint({ id: "m2", isActive: false }),
      ]);
      const list = await listActiveMints(db as never, "SOLANA" as never);
      expect(list).toHaveLength(1);
    });

    it("returns empty for no mints", async () => {
      const db = makeMockDb([]);
      const list = await listActiveMints(db as never, "SOLANA" as never);
      expect(list).toHaveLength(0);
    });
  });

  describe("requireMintInRegistry", () => {
    it("returns mint when it exists", async () => {
      const db = makeMockDb([makeMint()]);
      const mint = await requireMintInRegistry(
        db as never,
        "SOLANA" as never,
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      );
      expect(mint.symbol).toBe("USDC");
    });

    it("throws MintNotFoundError when not registered", async () => {
      const db = makeMockDb([]);
      await expect(
        requireMintInRegistry(db as never, "SOLANA" as never, "unknown")
      ).rejects.toThrow(MintNotFoundError);
    });

    it("MintNotFoundError has code", async () => {
      const db = makeMockDb([]);
      try {
        await requireMintInRegistry(db as never, "SOLANA" as never, "x");
      } catch (e) {
        expect((e as MintNotFoundError).code).toBe("MINT_NOT_FOUND");
      }
    });

    it("error message mentions registry", async () => {
      const db = makeMockDb([]);
      try {
        await requireMintInRegistry(db as never, "SOLANA" as never, "x");
      } catch (e) {
        expect((e as Error).message).toContain("Mint Registry");
      }
    });
  });

  describe("parseFundingDestination", () => {
    it("parses standard funding JSON", () => {
      const result = parseFundingDestination({
        chain: "SOL",
        mint: "USDC_MINT",
        address: "DEST_ADDR",
        amount: "1000000",
        tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      });
      expect(result.chain).toBe("SOLANA");
      expect(result.mintAddress).toBe("USDC_MINT");
      expect(result.destinationAddress).toBe("DEST_ADDR");
      expect(result.amount).toBe("1000000");
      expect(result.tokenProgram).toBe("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    });

    it("normalizes 'sol' to SOLANA", () => {
      const result = parseFundingDestination({ chain: "sol", mint: "m", address: "a", amount: "1" });
      expect(result.chain).toBe("SOLANA");
    });

    it("normalizes 'solana' to SOLANA", () => {
      const result = parseFundingDestination({ chain: "solana", mint: "m", address: "a", amount: "1" });
      expect(result.chain).toBe("SOLANA");
    });

    it("defaults to SOLANA when chain missing", () => {
      const result = parseFundingDestination({ mint: "m", address: "a", amount: "1" });
      expect(result.chain).toBe("SOLANA");
    });

    it("handles undefined tokenProgram", () => {
      const result = parseFundingDestination({ chain: "sol", mint: "m", address: "a", amount: "1" });
      expect(result.tokenProgram).toBeUndefined();
    });
  });
});
