import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getProviderCapabilities,
  isRailSupported,
  getRailDisabledReason,
  isAchEnabled,
  isLocalEnabled,
  UnsupportedRailError,
  UnsupportedCurrencyError,
  RAIL_DISABLED_MESSAGES,
} from "../fiat/payout-providers/capabilities";

function setEnv(key: string, val: string | undefined) {
  if (val === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = val;
  }
}

describe("Provider Capability Registry", () => {
  const origAch = process.env.ENABLE_ACH_PAYOUTS;
  const origLocal = process.env.ENABLE_LOCAL_PAYOUTS;

  afterEach(() => {
    setEnv("ENABLE_ACH_PAYOUTS", origAch);
    setEnv("ENABLE_LOCAL_PAYOUTS", origLocal);
  });

  describe("getProviderCapabilities", () => {
    it("returns CIRCLE capabilities with BANK_WIRE by default", () => {
      setEnv("ENABLE_ACH_PAYOUTS", undefined);
      setEnv("ENABLE_LOCAL_PAYOUTS", undefined);
      const cap = getProviderCapabilities("CIRCLE");
      expect(cap.provider).toBe("CIRCLE");
      expect(cap.supportedRails).toContain("BANK_WIRE");
      expect(cap.supportedCurrencies).toContain("USD");
      expect(cap.requiresOnChainFunding).toBe(true);
      expect(cap.supportsRecipientManagement).toBe(true);
    });

    it("includes ACH when env flag enabled", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      setEnv("ENABLE_LOCAL_PAYOUTS", "false");
      const cap = getProviderCapabilities("CIRCLE");
      expect(cap.supportedRails).toContain("ACH");
      expect(cap.features.ach).toBe(true);
    });

    it("includes LOCAL when env flag enabled", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "false");
      setEnv("ENABLE_LOCAL_PAYOUTS", "true");
      const cap = getProviderCapabilities("CIRCLE");
      expect(cap.supportedRails).toContain("LOCAL");
      expect(cap.features.local).toBe(true);
    });

    it("includes both ACH and LOCAL when both flags enabled", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      setEnv("ENABLE_LOCAL_PAYOUTS", "1");
      const cap = getProviderCapabilities("CIRCLE");
      expect(cap.supportedRails).toContain("ACH");
      expect(cap.supportedRails).toContain("LOCAL");
      expect(cap.supportedRails).toContain("BANK_WIRE");
    });

    it("is case-insensitive for provider name", () => {
      const cap = getProviderCapabilities("circle");
      expect(cap.provider).toBe("CIRCLE");
    });

    it("returns empty capabilities for unknown provider", () => {
      const cap = getProviderCapabilities("UNKNOWN_PROVIDER");
      expect(cap.provider).toBe("UNKNOWN_PROVIDER");
      expect(cap.supportedRails).toHaveLength(0);
      expect(cap.supportedCurrencies).toHaveLength(0);
    });

    it("CIRCLE always has wire feature", () => {
      const cap = getProviderCapabilities("CIRCLE");
      expect(cap.features.wire).toBe(true);
    });

    it("ACH defaults to false when flag not set", () => {
      setEnv("ENABLE_ACH_PAYOUTS", undefined);
      const cap = getProviderCapabilities("CIRCLE");
      expect(cap.features.ach).toBe(false);
      expect(cap.supportedRails).not.toContain("ACH");
    });

    it("LOCAL defaults to false when flag not set", () => {
      setEnv("ENABLE_LOCAL_PAYOUTS", undefined);
      const cap = getProviderCapabilities("CIRCLE");
      expect(cap.features.local).toBe(false);
      expect(cap.supportedRails).not.toContain("LOCAL");
    });
  });

  describe("isRailSupported", () => {
    it("returns true for BANK_WIRE + USD on CIRCLE", () => {
      expect(isRailSupported("CIRCLE", "BANK_WIRE" as any, "USD")).toBe(true);
    });

    it("returns false for BANK_WIRE + EUR on CIRCLE", () => {
      expect(isRailSupported("CIRCLE", "BANK_WIRE" as any, "EUR")).toBe(false);
    });

    it("returns false for ACH when flag disabled", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "false");
      expect(isRailSupported("CIRCLE", "ACH" as any, "USD")).toBe(false);
    });

    it("returns true for ACH when flag enabled", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      expect(isRailSupported("CIRCLE", "ACH" as any, "USD")).toBe(true);
    });

    it("returns false for unknown provider", () => {
      expect(isRailSupported("STRIPE", "BANK_WIRE" as any, "USD")).toBe(false);
    });

    it("currency check is case-insensitive", () => {
      expect(isRailSupported("CIRCLE", "BANK_WIRE" as any, "usd")).toBe(true);
    });
  });

  describe("isAchEnabled / isLocalEnabled", () => {
    it("isAchEnabled returns false by default", () => {
      setEnv("ENABLE_ACH_PAYOUTS", undefined);
      expect(isAchEnabled()).toBe(false);
    });

    it("isAchEnabled returns true when set to true", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      expect(isAchEnabled()).toBe(true);
    });

    it("isAchEnabled returns true when set to 1", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "1");
      expect(isAchEnabled()).toBe(true);
    });

    it("isLocalEnabled returns false by default", () => {
      setEnv("ENABLE_LOCAL_PAYOUTS", undefined);
      expect(isLocalEnabled()).toBe(false);
    });

    it("isLocalEnabled returns true when set to true", () => {
      setEnv("ENABLE_LOCAL_PAYOUTS", "true");
      expect(isLocalEnabled()).toBe(true);
    });
  });

  describe("getRailDisabledReason", () => {
    it("returns null for supported rail", () => {
      expect(getRailDisabledReason("CIRCLE", "BANK_WIRE" as any, "USD")).toBeNull();
    });

    it("returns FEATURE_FLAG_OFF for ACH when disabled", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "false");
      expect(getRailDisabledReason("CIRCLE", "ACH" as any, "USD")).toBe("FEATURE_FLAG_OFF");
    });

    it("returns FEATURE_FLAG_OFF for LOCAL when disabled", () => {
      setEnv("ENABLE_LOCAL_PAYOUTS", "false");
      expect(getRailDisabledReason("CIRCLE", "LOCAL" as any, "USD")).toBe("FEATURE_FLAG_OFF");
    });

    it("returns NOT_SUPPORTED_BY_PROVIDER for unknown provider", () => {
      expect(getRailDisabledReason("STRIPE", "BANK_WIRE" as any, "USD")).toBe(
        "NOT_SUPPORTED_BY_PROVIDER"
      );
    });

    it("returns DISABLED_BY_POLICY when policy disallows", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      expect(
        getRailDisabledReason("CIRCLE", "ACH" as any, "USD", ["BANK_WIRE"])
      ).toBe("DISABLED_BY_POLICY");
    });

    it("returns null when policy allows the rail", () => {
      expect(
        getRailDisabledReason("CIRCLE", "BANK_WIRE" as any, "USD", ["BANK_WIRE", "ACH"])
      ).toBeNull();
    });
  });

  describe("Error classes", () => {
    it("UnsupportedRailError has correct shape", () => {
      const err = new UnsupportedRailError("CIRCLE", "ACH", "USD");
      expect(err.code).toBe("UNSUPPORTED_RAIL");
      expect(err.provider).toBe("CIRCLE");
      expect(err.rail).toBe("ACH");
      expect(err.currency).toBe("USD");
      expect(err.message).toContain("ACH");
      expect(err.message).toContain("CIRCLE");
    });

    it("UnsupportedCurrencyError has correct shape", () => {
      const err = new UnsupportedCurrencyError("CIRCLE", "EUR");
      expect(err.code).toBe("UNSUPPORTED_CURRENCY");
      expect(err.provider).toBe("CIRCLE");
      expect(err.currency).toBe("EUR");
      expect(err.message).toContain("EUR");
    });
  });

  describe("RAIL_DISABLED_MESSAGES", () => {
    it("has message for all reason codes", () => {
      expect(RAIL_DISABLED_MESSAGES.FEATURE_FLAG_OFF).toBe("Feature flag off");
      expect(RAIL_DISABLED_MESSAGES.NOT_SUPPORTED_BY_PROVIDER).toBe("Not supported by provider");
      expect(RAIL_DISABLED_MESSAGES.DISABLED_BY_POLICY).toBe("Disabled by policy");
    });
  });
});
