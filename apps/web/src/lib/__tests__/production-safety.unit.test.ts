import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockUpsert = vi.fn();
const mockAuditCreate = vi.fn();
const mockEventCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    treasurySafetyControls: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    treasuryAuditLog: {
      create: (...args: unknown[]) => mockAuditCreate(...args),
    },
    treasuryEvent: {
      create: (...args: unknown[]) => mockEventCreate(...args),
    },
  },
}));

import { TreasurySafetyError, pauseAll, resumeAll, getEffectiveSafetyControls, assertPayoutsAllowed } from "../fiat/safety-controls";
import { resetAllBreakers, recordProviderFailure, configureCircuitBreakers, getCircuitBreakerStates } from "../fiat/circuit-breakers";
import { assertIdempotencyKeyPresent, MissingIdempotencyKeyError } from "../fiat/execution-guards";
import { createAuditImmutabilityMiddleware, AuditImmutabilityViolation } from "../fiat/audit-immutability";

beforeEach(() => {
  vi.clearAllMocks();
  resetAllBreakers();
  mockEventCreate.mockResolvedValue({ id: "ev" });
  mockAuditCreate.mockResolvedValue({ id: "al" });
  mockUpsert.mockResolvedValue({});
});

describe("Production Safety Integration", () => {
  describe("Global pause blocks all execution", () => {
    it("pauses and resumes operations", async () => {
      await pauseAll("org_1", "Emergency", "admin_1");
      expect(mockUpsert).toHaveBeenCalled();

      mockFindUnique.mockResolvedValue({
        payoutsPaused: true,
        onchainPaused: true,
        providerPaused: {},
        railsPaused: {},
        reason: "Emergency",
      });

      const controls = await getEffectiveSafetyControls("org_1");
      expect(controls.payoutsPaused).toBe(true);
      expect(controls.onchainPaused).toBe(true);

      await expect(assertPayoutsAllowed("org_1")).rejects.toThrow(TreasurySafetyError);

      await resumeAll("org_1", "admin_1");

      mockFindUnique.mockResolvedValue({
        payoutsPaused: false,
        onchainPaused: false,
        providerPaused: {},
        railsPaused: {},
        reason: "Operations resumed",
      });

      await expect(assertPayoutsAllowed("org_1")).resolves.toBeUndefined();
    });
  });

  describe("Circuit breaker auto-pauses provider", () => {
    it("trips and writes safety controls", async () => {
      configureCircuitBreakers({
        providerFailureRateThreshold: 0.5,
        providerMinSampleSize: 3,
        providerFailureWindowMs: 300_000,
        reconciliationCriticalStreak: 3,
      });

      await recordProviderFailure("CIRCLE", "org_1");
      await recordProviderFailure("CIRCLE", "org_1");
      const r = await recordProviderFailure("CIRCLE", "org_1");

      expect(r.tripped).toBe(true);
      expect(mockUpsert).toHaveBeenCalled();
      expect(mockAuditCreate).toHaveBeenCalled();

      const states = getCircuitBreakerStates();
      expect(states.trippedProviders).toContain("CIRCLE");
    });
  });

  describe("Idempotency enforcement", () => {
    it("rejects payout intents without idempotency key", () => {
      expect(() =>
        assertIdempotencyKeyPresent({ id: "i1", idempotencyKey: null })
      ).toThrow(MissingIdempotencyKeyError);
    });

    it("accepts payout intents with idempotency key", () => {
      expect(() =>
        assertIdempotencyKeyPresent({ id: "i1", idempotencyKey: "key_123" })
      ).not.toThrow();
    });
  });

  describe("Audit log immutability", () => {
    const middleware = createAuditImmutabilityMiddleware();
    const next = async () => ({});

    it("blocks update on TreasuryAuditLog", async () => {
      await expect(
        middleware(
          { model: "TreasuryAuditLog", action: "update", args: {} } as any,
          next
        )
      ).rejects.toThrow(AuditImmutabilityViolation);
    });

    it("blocks delete on TreasuryAuditLog", async () => {
      await expect(
        middleware(
          { model: "TreasuryAuditLog", action: "delete", args: {} } as any,
          next
        )
      ).rejects.toThrow(AuditImmutabilityViolation);
    });

    it("allows create on TreasuryAuditLog", async () => {
      await expect(
        middleware(
          { model: "TreasuryAuditLog", action: "create", args: {} } as any,
          next
        )
      ).resolves.toBeDefined();
    });

    it("allows findMany on TreasuryAuditLog", async () => {
      await expect(
        middleware(
          { model: "TreasuryAuditLog", action: "findMany", args: {} } as any,
          next
        )
      ).resolves.toBeDefined();
    });
  });

  describe("Safety error structure", () => {
    it("TreasurySafetyError contains control type and reason", () => {
      const err = new TreasurySafetyError("provider_paused", "Circle is down");
      expect(err.code).toBe("TREASURY_SAFETY_BLOCKED");
      expect(err.controlType).toBe("provider_paused");
      expect(err.reason).toBe("Circle is down");
      expect(err.message).toContain("provider_paused");
    });
  });

  describe("Multiple safety checks compose correctly", () => {
    it("first check failure short-circuits remaining", async () => {
      mockFindUnique.mockResolvedValue({
        payoutsPaused: true,
        onchainPaused: true,
        providerPaused: { CIRCLE: true },
        railsPaused: { BANK_WIRE: true },
        reason: "Everything paused",
      });

      const { assertAllSafetyChecks } = await import("../fiat/safety-controls");
      
      await expect(
        assertAllSafetyChecks({
          orgId: "org_1",
          provider: "CIRCLE",
          rail: "BANK_WIRE",
        })
      ).rejects.toThrow(TreasurySafetyError);

      const thrownErr = await assertAllSafetyChecks({
        orgId: "org_1",
        provider: "CIRCLE",
        rail: "BANK_WIRE",
      }).catch((e: TreasurySafetyError) => e);

      expect(thrownErr.controlType).toBe("payouts_paused");
    });
  });
});
