import { describe, it, expect } from "vitest";
import { TreasuryWalletType, TreasuryChain } from "@prisma/client";
import {
  WalletNotFoundError,
  SpendPolicyViolationError,
} from "../fiat/wallets/wallet-registry";
import { MintNotFoundError } from "../fiat/mints/mint-registry";
import { WarmKeyAccessError, SigningDisabledError } from "../fiat/wallets/signing";

describe("API types & error classes", () => {
  describe("TreasuryWalletType enum", () => {
    it("has HOT value", () => {
      expect(TreasuryWalletType.HOT).toBe("HOT");
    });

    it("has WARM value", () => {
      expect(TreasuryWalletType.WARM).toBe("WARM");
    });

    it("has OPERATIONAL value", () => {
      expect(TreasuryWalletType.OPERATIONAL).toBe("OPERATIONAL");
    });
  });

  describe("TreasuryChain enum", () => {
    it("has SOLANA value", () => {
      expect(TreasuryChain.SOLANA).toBe("SOLANA");
    });
  });

  describe("WalletNotFoundError", () => {
    it("has correct code", () => {
      const err = new WalletNotFoundError("test");
      expect(err.code).toBe("WALLET_NOT_FOUND");
    });

    it("preserves message", () => {
      const err = new WalletNotFoundError("no wallet");
      expect(err.message).toBe("no wallet");
    });

    it("is instance of Error", () => {
      expect(new WalletNotFoundError("x")).toBeInstanceOf(Error);
    });
  });

  describe("SpendPolicyViolationError", () => {
    it("has correct code", () => {
      const err = new SpendPolicyViolationError("too much");
      expect(err.code).toBe("SPEND_POLICY_VIOLATION");
    });

    it("defaults requiresApproval to false", () => {
      const err = new SpendPolicyViolationError("x");
      expect(err.requiresApproval).toBe(false);
    });

    it("accepts requiresApproval=true", () => {
      const err = new SpendPolicyViolationError("x", true);
      expect(err.requiresApproval).toBe(true);
    });
  });

  describe("MintNotFoundError", () => {
    it("has correct code", () => {
      const err = new MintNotFoundError("no mint");
      expect(err.code).toBe("MINT_NOT_FOUND");
    });
  });

  describe("WarmKeyAccessError", () => {
    it("has WARM_KEY_ACCESS_FORBIDDEN code", () => {
      const err = new WarmKeyAccessError();
      expect(err.code).toBe("WARM_KEY_ACCESS_FORBIDDEN");
    });
  });

  describe("SigningDisabledError", () => {
    it("has SIGNING_DISABLED code", () => {
      const err = new SigningDisabledError("msg");
      expect(err.code).toBe("SIGNING_DISABLED");
    });
  });

  describe("wallet-registry exports", () => {
    it("getActiveWallet is a function", async () => {
      const mod = await import("../fiat/wallets/wallet-registry");
      expect(typeof mod.getActiveWallet).toBe("function");
    });

    it("resolveFundingWalletForPayout is a function", async () => {
      const mod = await import("../fiat/wallets/wallet-registry");
      expect(typeof mod.resolveFundingWalletForPayout).toBe("function");
    });

    it("assertWalletSpendPolicy is a function", async () => {
      const mod = await import("../fiat/wallets/wallet-registry");
      expect(typeof mod.assertWalletSpendPolicy).toBe("function");
    });

    it("listActiveWallets is a function", async () => {
      const mod = await import("../fiat/wallets/wallet-registry");
      expect(typeof mod.listActiveWallets).toBe("function");
    });

    it("getSpendPolicy is a function", async () => {
      const mod = await import("../fiat/wallets/wallet-registry");
      expect(typeof mod.getSpendPolicy).toBe("function");
    });
  });

  describe("mint-registry exports", () => {
    it("getMintByAddress is a function", async () => {
      const mod = await import("../fiat/mints/mint-registry");
      expect(typeof mod.getMintByAddress).toBe("function");
    });

    it("getMintBySymbol is a function", async () => {
      const mod = await import("../fiat/mints/mint-registry");
      expect(typeof mod.getMintBySymbol).toBe("function");
    });

    it("listActiveMints is a function", async () => {
      const mod = await import("../fiat/mints/mint-registry");
      expect(typeof mod.listActiveMints).toBe("function");
    });

    it("requireMintInRegistry is a function", async () => {
      const mod = await import("../fiat/mints/mint-registry");
      expect(typeof mod.requireMintInRegistry).toBe("function");
    });

    it("parseFundingDestination is a function", async () => {
      const mod = await import("../fiat/mints/mint-registry");
      expect(typeof mod.parseFundingDestination).toBe("function");
    });
  });
});
