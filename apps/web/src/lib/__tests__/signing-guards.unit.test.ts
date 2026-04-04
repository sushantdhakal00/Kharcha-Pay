import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  WarmKeyAccessError,
  SigningDisabledError,
  assertNotWarmWallet,
} from "../fiat/wallets/signing";

describe("signing-guards", () => {
  describe("WarmKeyAccessError", () => {
    it("has correct code", () => {
      const err = new WarmKeyAccessError();
      expect(err.code).toBe("WARM_KEY_ACCESS_FORBIDDEN");
    });

    it("has descriptive message", () => {
      const err = new WarmKeyAccessError();
      expect(err.message).toContain("WARM");
      expect(err.message).toContain("NEVER");
    });

    it("is an instance of Error", () => {
      const err = new WarmKeyAccessError();
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("SigningDisabledError", () => {
    it("has correct code", () => {
      const err = new SigningDisabledError("no key");
      expect(err.code).toBe("SIGNING_DISABLED");
    });

    it("preserves message", () => {
      const err = new SigningDisabledError("test message");
      expect(err.message).toBe("test message");
    });
  });

  describe("assertNotWarmWallet", () => {
    it("throws for WARM wallet type", () => {
      expect(() => assertNotWarmWallet("WARM" as never)).toThrow(WarmKeyAccessError);
    });

    it("does not throw for HOT wallet type", () => {
      expect(() => assertNotWarmWallet("HOT" as never)).not.toThrow();
    });

    it("does not throw for OPERATIONAL wallet type", () => {
      expect(() => assertNotWarmWallet("OPERATIONAL" as never)).not.toThrow();
    });

    it("error thrown for WARM contains correct code", () => {
      try {
        assertNotWarmWallet("WARM" as never);
      } catch (e) {
        expect((e as WarmKeyAccessError).code).toBe("WARM_KEY_ACCESS_FORBIDDEN");
      }
    });

    it("error message mentions HSM or worker", () => {
      try {
        assertNotWarmWallet("WARM" as never);
      } catch (e) {
        expect((e as Error).message).toContain("worker");
      }
    });
  });

  describe("signAndSendSolanaTransfer (import check)", () => {
    it("rejects WARM wallet before any RPC call", async () => {
      const { signAndSendSolanaTransfer } = await import("../fiat/wallets/signing");
      await expect(
        signAndSendSolanaTransfer({
          fromWalletType: "WARM" as never,
          mintAddress: "SomeMint123456789012345678901234",
          destinationAddress: "SomeDest12345678901234567890123",
          amountRaw: 1000n,
        })
      ).rejects.toThrow(WarmKeyAccessError);
    });
  });

  describe("key isolation boundary", () => {
    it("WARM wallet type is consistently blocked", () => {
      const warmTypes = ["WARM"];
      for (const t of warmTypes) {
        expect(() => assertNotWarmWallet(t as never)).toThrow(WarmKeyAccessError);
      }
    });

    it("HOT and OPERATIONAL are allowed", () => {
      const allowed = ["HOT", "OPERATIONAL"];
      for (const t of allowed) {
        expect(() => assertNotWarmWallet(t as never)).not.toThrow();
      }
    });
  });
});
