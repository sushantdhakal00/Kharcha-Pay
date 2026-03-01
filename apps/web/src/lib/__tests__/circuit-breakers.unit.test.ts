import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    treasurySafetyControls: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    treasuryAuditLog: {
      create: vi.fn().mockResolvedValue({ id: "al_1" }),
    },
    treasuryEvent: {
      create: vi.fn().mockResolvedValue({ id: "ev_1" }),
    },
  },
}));

import {
  configureCircuitBreakers,
  recordProviderSuccess,
  recordProviderFailure,
  recordReconciliationSeverity,
  getCircuitBreakerStates,
  resetProviderBreaker,
  resetReconciliationBreaker,
  resetAllBreakers,
} from "../fiat/circuit-breakers";

beforeEach(() => {
  resetAllBreakers();
  configureCircuitBreakers({
    providerFailureRateThreshold: 0.5,
    providerFailureWindowMs: 5 * 60 * 1000,
    providerMinSampleSize: 3,
    reconciliationCriticalStreak: 2,
  });
});

describe("circuit-breakers provider tracking", () => {
  it("does not trip on few failures below threshold", async () => {
    recordProviderSuccess("CIRCLE");
    recordProviderSuccess("CIRCLE");
    const result = await recordProviderFailure("CIRCLE");
    expect(result.tripped).toBe(false);
  });

  it("trips when failure rate exceeds threshold", async () => {
    await recordProviderFailure("CIRCLE");
    await recordProviderFailure("CIRCLE");
    const result = await recordProviderFailure("CIRCLE");
    expect(result.tripped).toBe(true);
  });

  it("does not trip below minimum sample size", async () => {
    configureCircuitBreakers({ providerMinSampleSize: 10 });
    for (let i = 0; i < 5; i++) {
      await recordProviderFailure("CIRCLE");
    }
    const states = getCircuitBreakerStates();
    expect(states.trippedProviders).not.toContain("CIRCLE");
  });

  it("records success separately per provider", () => {
    recordProviderSuccess("CIRCLE");
    recordProviderSuccess("STRIPE");
    const states = getCircuitBreakerStates();
    expect(states.providerMetrics).toHaveProperty("CIRCLE");
    expect(states.providerMetrics).toHaveProperty("STRIPE");
  });

  it("does not double-trip same provider", async () => {
    await recordProviderFailure("CIRCLE");
    await recordProviderFailure("CIRCLE");
    const r1 = await recordProviderFailure("CIRCLE");
    const r2 = await recordProviderFailure("CIRCLE");
    expect(r1.tripped).toBe(true);
    expect(r2.tripped).toBe(false);
  });

  it("reports tripped providers in state", async () => {
    await recordProviderFailure("CIRCLE");
    await recordProviderFailure("CIRCLE");
    await recordProviderFailure("CIRCLE");
    const states = getCircuitBreakerStates();
    expect(states.trippedProviders).toContain("CIRCLE");
  });

  it("calculates failure rate correctly", () => {
    recordProviderSuccess("TEST");
    recordProviderSuccess("TEST");
    recordProviderSuccess("TEST");
    const states = getCircuitBreakerStates();
    expect(states.providerMetrics.TEST.failureRate).toBe(0);
    expect(states.providerMetrics.TEST.successes).toBe(3);
  });
});

describe("circuit-breakers reconciliation tracking", () => {
  it("does not trip on non-critical severity", async () => {
    const r = await recordReconciliationSeverity("org_1", "INFO");
    expect(r.tripped).toBe(false);
  });

  it("does not trip on single critical", async () => {
    const r = await recordReconciliationSeverity("org_1", "CRITICAL");
    expect(r.tripped).toBe(false);
  });

  it("trips after consecutive critical streak", async () => {
    await recordReconciliationSeverity("org_1", "CRITICAL");
    const r = await recordReconciliationSeverity("org_1", "CRITICAL");
    expect(r.tripped).toBe(true);
  });

  it("resets streak on non-critical severity", async () => {
    await recordReconciliationSeverity("org_1", "CRITICAL");
    await recordReconciliationSeverity("org_1", "INFO");
    const r = await recordReconciliationSeverity("org_1", "CRITICAL");
    expect(r.tripped).toBe(false);
  });

  it("tracks different orgs independently", async () => {
    await recordReconciliationSeverity("org_1", "CRITICAL");
    const r = await recordReconciliationSeverity("org_2", "CRITICAL");
    expect(r.tripped).toBe(false);
  });

  it("does not double-trip for same org", async () => {
    await recordReconciliationSeverity("org_1", "CRITICAL");
    const r1 = await recordReconciliationSeverity("org_1", "CRITICAL");
    const r2 = await recordReconciliationSeverity("org_1", "CRITICAL");
    expect(r1.tripped).toBe(true);
    expect(r2.tripped).toBe(false);
  });
});

describe("circuit-breakers reset", () => {
  it("resetProviderBreaker clears tripped state", async () => {
    await recordProviderFailure("CIRCLE");
    await recordProviderFailure("CIRCLE");
    await recordProviderFailure("CIRCLE");
    expect(getCircuitBreakerStates().trippedProviders).toContain("CIRCLE");

    await resetProviderBreaker("CIRCLE");
    expect(getCircuitBreakerStates().trippedProviders).not.toContain("CIRCLE");
  });

  it("resetReconciliationBreaker clears tripped state", async () => {
    await recordReconciliationSeverity("org_1", "CRITICAL");
    await recordReconciliationSeverity("org_1", "CRITICAL");
    expect(getCircuitBreakerStates().trippedReconciliation).toContain("org_1");

    await resetReconciliationBreaker("org_1");
    expect(getCircuitBreakerStates().trippedReconciliation).not.toContain("org_1");
  });

  it("resetAllBreakers clears everything", async () => {
    await recordProviderFailure("CIRCLE");
    await recordProviderFailure("CIRCLE");
    await recordProviderFailure("CIRCLE");
    await recordReconciliationSeverity("org_1", "CRITICAL");
    await recordReconciliationSeverity("org_1", "CRITICAL");

    resetAllBreakers();
    const states = getCircuitBreakerStates();
    expect(states.trippedProviders).toHaveLength(0);
    expect(states.trippedReconciliation).toHaveLength(0);
    expect(Object.keys(states.providerMetrics)).toHaveLength(0);
  });
});

describe("getCircuitBreakerStates", () => {
  it("returns empty state initially", () => {
    const states = getCircuitBreakerStates();
    expect(states.trippedProviders).toHaveLength(0);
    expect(states.trippedReconciliation).toHaveLength(0);
    expect(Object.keys(states.providerMetrics)).toHaveLength(0);
  });

  it("includes metrics for tracked providers", () => {
    recordProviderSuccess("CIRCLE");
    const states = getCircuitBreakerStates();
    expect(states.providerMetrics).toHaveProperty("CIRCLE");
    expect(states.providerMetrics.CIRCLE.successes).toBe(1);
    expect(states.providerMetrics.CIRCLE.failures).toBe(0);
  });
});
