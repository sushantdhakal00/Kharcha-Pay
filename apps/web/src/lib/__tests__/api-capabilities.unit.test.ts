import { describe, it, expect, afterEach } from "vitest";
import {
  getProviderCapabilities,
  isRailSupported,
  getRailDisabledReason,
  isAchEnabled,
  isLocalEnabled,
  RAIL_DISABLED_MESSAGES,
  type ProviderCapability,
  type RailDisabledReason,
} from "../fiat/payout-providers/capabilities";
import {
  evaluatePayoutRisk,
  resolveRules,
  DEFAULT_POLICY_RULES,
  type TreasuryPolicyRules,
  type HistoricalStats,
} from "../fiat/treasury-policy";

function setEnv(key: string, val: string | undefined) {
  if (val === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = val;
  }
}

const zeroStats: HistoricalStats = {
  orgDailyAmountMinor: 0,
  orgWeeklyAmountMinor: 0,
  orgMonthlyAmountMinor: 0,
  orgDailyCount: 0,
  vendorDailyAmountMinor: 0,
  vendorDailyCount: 0,
};

describe("API Capabilities Integration", () => {
  const origAch = process.env.ENABLE_ACH_PAYOUTS;
  const origLocal = process.env.ENABLE_LOCAL_PAYOUTS;

  afterEach(() => {
    setEnv("ENABLE_ACH_PAYOUTS", origAch);
    setEnv("ENABLE_LOCAL_PAYOUTS", origLocal);
  });

  describe("Capability response shape", () => {
    it("returns valid ProviderCapability for CIRCLE", () => {
      const cap = getProviderCapabilities("CIRCLE");
      expect(cap).toHaveProperty("provider");
      expect(cap).toHaveProperty("supportedRails");
      expect(cap).toHaveProperty("supportedCurrencies");
      expect(cap).toHaveProperty("requiresOnChainFunding");
      expect(cap).toHaveProperty("supportsRecipientManagement");
      expect(cap).toHaveProperty("features");
    });

    it("features has boolean properties", () => {
      const cap = getProviderCapabilities("CIRCLE");
      expect(typeof cap.features.wire).toBe("boolean");
    });

    it("getRailDisabledReason returns proper type", () => {
      const reason = getRailDisabledReason("CIRCLE", "BANK_WIRE" as any, "USD");
      expect(reason === null || typeof reason === "string").toBe(true);
    });
  });

  describe("Rail status computation for API", () => {
    it("computes all three rails", () => {
      const rails = ["BANK_WIRE", "ACH", "LOCAL"] as const;
      const statuses = rails.map((rail) => ({
        rail,
        enabled: getRailDisabledReason("CIRCLE", rail as any, "USD") === null,
        disabledReason: getRailDisabledReason("CIRCLE", rail as any, "USD"),
      }));
      expect(statuses).toHaveLength(3);
      expect(statuses[0].enabled).toBe(true);
    });

    it("ACH shows feature flag reason when disabled", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "false");
      const reason = getRailDisabledReason("CIRCLE", "ACH" as any, "USD");
      expect(reason).toBe("FEATURE_FLAG_OFF");
      expect(RAIL_DISABLED_MESSAGES[reason!]).toBe("Feature flag off");
    });

    it("ACH shows enabled when flag on", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      const reason = getRailDisabledReason("CIRCLE", "ACH" as any, "USD");
      expect(reason).toBeNull();
    });

    it("LOCAL shows feature flag reason when disabled", () => {
      setEnv("ENABLE_LOCAL_PAYOUTS", "false");
      const reason = getRailDisabledReason("CIRCLE", "LOCAL" as any, "USD");
      expect(reason).toBe("FEATURE_FLAG_OFF");
    });
  });

  describe("Policy integration with capabilities", () => {
    it("policy blocks ACH when flag is off via evaluatePayoutRisk", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "false");
      const rules = resolveRules(null);
      const result = evaluatePayoutRisk(
        {
          amountMinor: 1000,
          currency: "USD",
          vendorId: "v1",
          payoutRail: "ACH",
          provider: "CIRCLE",
        },
        rules,
        zeroStats
      );
      expect(result.riskStatus).toBe("BLOCKED");
      expect(result.reasons.some((r) => r.includes("feature flag"))).toBe(true);
    });

    it("policy blocks LOCAL when flag is off", () => {
      setEnv("ENABLE_LOCAL_PAYOUTS", "false");
      const rules = resolveRules(null);
      const result = evaluatePayoutRisk(
        {
          amountMinor: 1000,
          currency: "USD",
          vendorId: "v1",
          payoutRail: "LOCAL",
          provider: "CIRCLE",
        },
        rules,
        zeroStats
      );
      expect(result.riskStatus).toBe("BLOCKED");
      expect(result.reasons.some((r) => r.includes("feature flag") || r.includes("not supported"))).toBe(true);
    });

    it("BANK_WIRE still works with default policy", () => {
      const rules = resolveRules(null);
      const result = evaluatePayoutRisk(
        {
          amountMinor: 1000,
          currency: "USD",
          vendorId: "v1",
          payoutRail: "BANK_WIRE",
          provider: "CIRCLE",
        },
        rules,
        zeroStats
      );
      expect(result.riskStatus).toBe("CLEAR");
    });

    it("policy blocks unsupported provider via capabilities", () => {
      const rules: TreasuryPolicyRules = { allowedProviders: ["CIRCLE"] };
      const result = evaluatePayoutRisk(
        {
          amountMinor: 1000,
          currency: "USD",
          payoutRail: "BANK_WIRE",
          provider: "STRIPE",
        },
        rules,
        zeroStats
      );
      expect(result.riskStatus).toBe("BLOCKED");
    });

    it("policy-only rail block shows disabled by policy", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      const reason = getRailDisabledReason("CIRCLE", "ACH" as any, "USD", ["BANK_WIRE"]);
      expect(reason).toBe("DISABLED_BY_POLICY");
    });
  });

  describe("Flags endpoint data", () => {
    it("reports achEnabled correctly", () => {
      setEnv("ENABLE_ACH_PAYOUTS", "true");
      expect(isAchEnabled()).toBe(true);
      setEnv("ENABLE_ACH_PAYOUTS", "false");
      expect(isAchEnabled()).toBe(false);
    });

    it("reports localEnabled correctly", () => {
      setEnv("ENABLE_LOCAL_PAYOUTS", "1");
      expect(isLocalEnabled()).toBe(true);
      setEnv("ENABLE_LOCAL_PAYOUTS", "0");
      expect(isLocalEnabled()).toBe(false);
    });
  });
});
