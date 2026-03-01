import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
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

import {
  TreasurySafetyError,
  getEffectiveSafetyControls,
  assertPayoutsAllowed,
  assertOnchainAllowed,
  assertProviderAllowed,
  assertRailAllowed,
  assertAllSafetyChecks,
} from "../fiat/safety-controls";

beforeEach(() => {
  vi.clearAllMocks();
  mockEventCreate.mockResolvedValue({ id: "ev_1" });
  mockAuditCreate.mockResolvedValue({ id: "al_1" });
});

describe("TreasurySafetyError", () => {
  it("has correct code and properties", () => {
    const err = new TreasurySafetyError("payouts_paused", "test reason");
    expect(err.code).toBe("TREASURY_SAFETY_BLOCKED");
    expect(err.controlType).toBe("payouts_paused");
    expect(err.reason).toBe("test reason");
    expect(err.message).toContain("payouts_paused");
  });
});

describe("getEffectiveSafetyControls", () => {
  it("returns org controls when org has them", async () => {
    mockFindUnique.mockResolvedValue({
      payoutsPaused: true,
      onchainPaused: false,
      providerPaused: { CIRCLE: true },
      railsPaused: {},
      reason: "Maintenance",
    });

    const controls = await getEffectiveSafetyControls("org_1");
    expect(controls.payoutsPaused).toBe(true);
    expect(controls.providerPaused).toEqual({ CIRCLE: true });
    expect(controls.source).toBe("org");
  });

  it("falls back to global when no org controls", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue({
      payoutsPaused: true,
      onchainPaused: true,
      providerPaused: {},
      railsPaused: {},
      reason: "Global pause",
    });

    const controls = await getEffectiveSafetyControls("org_1");
    expect(controls.payoutsPaused).toBe(true);
    expect(controls.source).toBe("global");
  });

  it("returns defaults when no controls exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);

    const controls = await getEffectiveSafetyControls("org_1");
    expect(controls.payoutsPaused).toBe(false);
    expect(controls.onchainPaused).toBe(false);
    expect(controls.source).toBe("global");
  });

  it("returns global controls when orgId is null", async () => {
    mockFindFirst.mockResolvedValue({
      payoutsPaused: false,
      onchainPaused: false,
      providerPaused: {},
      railsPaused: {},
      reason: "",
    });

    const controls = await getEffectiveSafetyControls(null);
    expect(controls.source).toBe("global");
  });
});

describe("assertPayoutsAllowed", () => {
  it("does not throw when payouts are not paused", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);

    await expect(assertPayoutsAllowed("org_1")).resolves.toBeUndefined();
  });

  it("throws TreasurySafetyError when payouts are paused", async () => {
    mockFindUnique.mockResolvedValue({
      payoutsPaused: true,
      onchainPaused: false,
      providerPaused: {},
      railsPaused: {},
      reason: "test pause",
    });

    await expect(assertPayoutsAllowed("org_1")).rejects.toThrow(TreasurySafetyError);
  });

  it("emits event and audit log when blocked", async () => {
    mockFindUnique.mockResolvedValue({
      payoutsPaused: true,
      onchainPaused: false,
      providerPaused: {},
      railsPaused: {},
      reason: "blocked",
    });

    await expect(assertPayoutsAllowed("org_1")).rejects.toThrow();
    expect(mockAuditCreate).toHaveBeenCalled();
    expect(mockEventCreate).toHaveBeenCalled();
  });
});

describe("assertOnchainAllowed", () => {
  it("does not throw when on-chain is not paused", async () => {
    mockFindUnique.mockResolvedValue({
      payoutsPaused: false,
      onchainPaused: false,
      providerPaused: {},
      railsPaused: {},
      reason: "",
    });

    await expect(assertOnchainAllowed("org_1")).resolves.toBeUndefined();
  });

  it("throws when on-chain is paused", async () => {
    mockFindUnique.mockResolvedValue({
      payoutsPaused: false,
      onchainPaused: true,
      providerPaused: {},
      railsPaused: {},
      reason: "chain pause",
    });

    await expect(assertOnchainAllowed("org_1")).rejects.toThrow(TreasurySafetyError);
  });
});

describe("assertProviderAllowed", () => {
  it("does not throw when provider is not paused", async () => {
    mockFindUnique.mockResolvedValue({
      payoutsPaused: false,
      onchainPaused: false,
      providerPaused: { CIRCLE: false },
      railsPaused: {},
      reason: "",
    });

    await expect(assertProviderAllowed("CIRCLE", "org_1")).resolves.toBeUndefined();
  });

  it("throws when specific provider is paused", async () => {
    mockFindUnique.mockResolvedValue({
      payoutsPaused: false,
      onchainPaused: false,
      providerPaused: { CIRCLE: true },
      railsPaused: {},
      reason: "Circle down",
    });

    await expect(assertProviderAllowed("CIRCLE", "org_1")).rejects.toThrow(TreasurySafetyError);
  });

  it("normalizes provider name to uppercase", async () => {
    mockFindUnique.mockResolvedValue({
      payoutsPaused: false,
      onchainPaused: false,
      providerPaused: { CIRCLE: true },
      railsPaused: {},
      reason: "",
    });

    await expect(assertProviderAllowed("circle", "org_1")).rejects.toThrow();
  });
});

describe("assertRailAllowed", () => {
  it("does not throw when rail is not paused", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);

    await expect(assertRailAllowed("BANK_WIRE", "org_1")).resolves.toBeUndefined();
  });

  it("throws when rail is paused", async () => {
    mockFindUnique.mockResolvedValue({
      payoutsPaused: false,
      onchainPaused: false,
      providerPaused: {},
      railsPaused: { BANK_WIRE: true },
      reason: "Wire paused",
    });

    await expect(assertRailAllowed("BANK_WIRE", "org_1")).rejects.toThrow(TreasurySafetyError);
  });
});

describe("assertAllSafetyChecks", () => {
  it("passes when nothing is paused", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);

    await expect(
      assertAllSafetyChecks({ orgId: "org_1", provider: "CIRCLE", rail: "BANK_WIRE" })
    ).resolves.toBeUndefined();
  });

  it("throws on first paused control", async () => {
    mockFindUnique.mockResolvedValue({
      payoutsPaused: true,
      onchainPaused: false,
      providerPaused: {},
      railsPaused: {},
      reason: "paused",
    });

    await expect(
      assertAllSafetyChecks({ orgId: "org_1", provider: "CIRCLE", rail: "BANK_WIRE" })
    ).rejects.toThrow(TreasurySafetyError);
  });
});
