import { describe, it, expect, afterEach } from "vitest";
import {
  getRailDisabledReason,
  RAIL_DISABLED_MESSAGES,
  isAchEnabled,
  isLocalEnabled,
  getProviderCapabilities,
} from "../fiat/payout-providers/capabilities";

function setEnv(key: string, val: string | undefined) {
  if (val === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = val;
  }
}

interface RailStatusInfo {
  rail: string;
  enabled: boolean;
  disabledReason: string | null;
  disabledReasonCode: string | null;
}

function computeRailStatus(
  provider: string,
  currency: string,
  policyAllowedRails?: string[]
): RailStatusInfo[] {
  const allRails = ["BANK_WIRE", "ACH", "LOCAL"];
  return allRails.map((rail) => {
    const reason = getRailDisabledReason(
      provider,
      rail as any,
      currency,
      policyAllowedRails
    );
    return {
      rail,
      enabled: reason === null,
      disabledReason: reason ? RAIL_DISABLED_MESSAGES[reason] : null,
      disabledReasonCode: reason,
    };
  });
}

describe("UI Rail Enablement Logic", () => {
  const origAch = process.env.ENABLE_ACH_PAYOUTS;
  const origLocal = process.env.ENABLE_LOCAL_PAYOUTS;

  afterEach(() => {
    setEnv("ENABLE_ACH_PAYOUTS", origAch);
    setEnv("ENABLE_LOCAL_PAYOUTS", origLocal);
  });

  describe("computeRailStatus (pure helper)", () => {
    it("BANK_WIRE is enabled by default", () => {
      const status = computeRailStatus("CIRCLE", "USD");
      const wire = status.find((r) => r.rail === "BANK_WIRE")!;
      expect(wire.enabled).toBe(true);
      expect(wire.disabledReason).toBeNull();
    });

    it("ACH is disabled by default with correct reason", () => {
      setEnv("ENABLE_ACH_PAYOUTS", undefined);
      const status = computeRailStatus("CIRCLE", "USD");
      const ach = status.find((r) => r.rail === "ACH")!;
      expect(ach.enabled).toBe(false);
      expect(ach.disabledReason).toBe("Feature flag off");
    });

    it("LOCAL is disabled by default with correct reason", () => {
      setEnv("ENABLE_LOCAL_PAYOUTS", undefined);
      const status = computeRailStatus("CIRCLE", "USD");
      const local = status.find((r) => r.rail === "LOCAL")!;
      expect(local.enabled).toBe(false);
      expect(local.disabledReason).toBe("Feature flag off");
    });

    it("ACH becomes enabled when flag is on", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      const status = computeRailStatus("CIRCLE", "USD");
      const ach = status.find((r) => r.rail === "ACH")!;
      expect(ach.enabled).toBe(true);
      expect(ach.disabledReason).toBeNull();
    });

    it("LOCAL becomes enabled when flag is on", () => {
      setEnv("ENABLE_LOCAL_PAYOUTS", "true");
      const status = computeRailStatus("CIRCLE", "USD");
      const local = status.find((r) => r.rail === "LOCAL")!;
      expect(local.enabled).toBe(true);
      expect(local.disabledReason).toBeNull();
    });

    it("policy-disabled rail shows correct reason", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      const status = computeRailStatus("CIRCLE", "USD", ["BANK_WIRE"]);
      const ach = status.find((r) => r.rail === "ACH")!;
      expect(ach.enabled).toBe(false);
      expect(ach.disabledReason).toBe("Disabled by policy");
    });

    it("unknown provider disables all rails", () => {
      const status = computeRailStatus("UNKNOWN", "USD");
      expect(status.every((r) => !r.enabled)).toBe(true);
      expect(status[0].disabledReason).toBe("Not supported by provider");
    });

    it("all rails disabled for unsupported currency", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      setEnv("ENABLE_LOCAL_PAYOUTS", "true");
      const status = computeRailStatus("CIRCLE", "EUR");
      expect(status.every((r) => !r.enabled)).toBe(true);
    });
  });

  describe("Disabled reason messages", () => {
    it("FEATURE_FLAG_OFF has human-readable message", () => {
      expect(RAIL_DISABLED_MESSAGES.FEATURE_FLAG_OFF).toBe("Feature flag off");
    });

    it("NOT_SUPPORTED_BY_PROVIDER has human-readable message", () => {
      expect(RAIL_DISABLED_MESSAGES.NOT_SUPPORTED_BY_PROVIDER).toBe(
        "Not supported by provider"
      );
    });

    it("DISABLED_BY_POLICY has human-readable message", () => {
      expect(RAIL_DISABLED_MESSAGES.DISABLED_BY_POLICY).toBe("Disabled by policy");
    });
  });

  describe("Dropdown state derivation", () => {
    it("disabled option shows reason in label", () => {
      setEnv("ENABLE_ACH_PAYOUTS", undefined);
      const status = computeRailStatus("CIRCLE", "USD");
      const ach = status.find((r) => r.rail === "ACH")!;
      const label = `ACH${!ach.enabled && ach.disabledReason ? ` (${ach.disabledReason})` : ""}`;
      expect(label).toBe("ACH (Feature flag off)");
    });

    it("enabled option has clean label", () => {
      const status = computeRailStatus("CIRCLE", "USD");
      const wire = status.find((r) => r.rail === "BANK_WIRE")!;
      const label = `Wire${!wire.enabled && wire.disabledReason ? ` (${wire.disabledReason})` : ""}`;
      expect(label).toBe("Wire");
    });

    it("returns exactly 3 rail options", () => {
      const status = computeRailStatus("CIRCLE", "USD");
      expect(status).toHaveLength(3);
    });
  });
});
