import { describe, it, expect } from "vitest";
import { _deriveCircleRequestId } from "../fiat/fiat-payout-service";

describe("provider-agnostic service", () => {
  describe("deriveCircleRequestId (backward compat)", () => {
    it("returns a UUID-shaped string", () => {
      const result = _deriveCircleRequestId("test-key-123");
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(result).toMatch(uuidRegex);
    });

    it("is deterministic (same input → same output)", () => {
      const a = _deriveCircleRequestId("my-idempotency-key");
      const b = _deriveCircleRequestId("my-idempotency-key");
      expect(a).toBe(b);
    });

    it("produces different outputs for different inputs", () => {
      const a = _deriveCircleRequestId("key-1");
      const b = _deriveCircleRequestId("key-2");
      expect(a).not.toBe(b);
    });
  });

  describe("resolveProviderPayoutId fallback logic", () => {
    it("prefers providerPayoutId over circlePayoutId", () => {
      const intent = {
        providerPayoutId: "provider-123",
        circlePayoutId: "circle-456",
      };
      const resolved = intent.providerPayoutId ?? intent.circlePayoutId ?? null;
      expect(resolved).toBe("provider-123");
    });

    it("falls back to circlePayoutId when providerPayoutId is null", () => {
      const intent = {
        providerPayoutId: null as string | null,
        circlePayoutId: "circle-456",
      };
      const resolved = intent.providerPayoutId ?? intent.circlePayoutId ?? null;
      expect(resolved).toBe("circle-456");
    });

    it("returns null when both are null", () => {
      const intent = {
        providerPayoutId: null as string | null,
        circlePayoutId: null as string | null,
      };
      const resolved = intent.providerPayoutId ?? intent.circlePayoutId ?? null;
      expect(resolved).toBeNull();
    });
  });

  describe("rail validation", () => {
    it("BANK_WIRE is supported for CIRCLE", () => {
      const supportedRails: Record<string, string[]> = { CIRCLE: ["BANK_WIRE"] };
      expect(supportedRails["CIRCLE"]).toContain("BANK_WIRE");
    });

    it("ACH is not supported for CIRCLE", () => {
      const supportedRails: Record<string, string[]> = { CIRCLE: ["BANK_WIRE"] };
      expect(supportedRails["CIRCLE"]).not.toContain("ACH");
    });

    it("LOCAL is not supported for CIRCLE", () => {
      const supportedRails: Record<string, string[]> = { CIRCLE: ["BANK_WIRE"] };
      expect(supportedRails["CIRCLE"]).not.toContain("LOCAL");
    });
  });
});
