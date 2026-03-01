import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    treasuryPayoutIntent: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

import {
  assertIdempotencyKeyPresent,
  assertNotAlreadyExecuted,
  assertOnchainTxNotDuplicate,
  MissingIdempotencyKeyError,
  DuplicateExecutionError,
  DuplicateOnchainTxError,
} from "../fiat/execution-guards";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertIdempotencyKeyPresent", () => {
  it("does not throw when key is present", () => {
    expect(() =>
      assertIdempotencyKeyPresent({ id: "i1", idempotencyKey: "key_abc" })
    ).not.toThrow();
  });

  it("throws MissingIdempotencyKeyError when key is null", () => {
    expect(() =>
      assertIdempotencyKeyPresent({ id: "i1", idempotencyKey: null })
    ).toThrow(MissingIdempotencyKeyError);
  });

  it("throws MissingIdempotencyKeyError when key is undefined", () => {
    expect(() =>
      assertIdempotencyKeyPresent({ id: "i1" })
    ).toThrow(MissingIdempotencyKeyError);
  });

  it("throws MissingIdempotencyKeyError when key is empty string", () => {
    expect(() =>
      assertIdempotencyKeyPresent({ id: "i1", idempotencyKey: "" })
    ).toThrow(MissingIdempotencyKeyError);
  });

  it("has correct error code", () => {
    const err = new MissingIdempotencyKeyError();
    expect(err.code).toBe("MISSING_IDEMPOTENCY_KEY");
  });
});

describe("assertNotAlreadyExecuted", () => {
  it("does not throw for active intent", async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      assertNotAlreadyExecuted({
        id: "i1",
        status: "PENDING",
        providerPayoutId: null,
        circlePayoutId: null,
        onchainTxSig: null,
      })
    ).resolves.toBeUndefined();
  });

  it("throws for COMPLETED intent", async () => {
    await expect(
      assertNotAlreadyExecuted({
        id: "i1",
        status: "COMPLETED",
        providerPayoutId: null,
        circlePayoutId: null,
        onchainTxSig: null,
      })
    ).rejects.toThrow(DuplicateExecutionError);
  });

  it("throws for FAILED intent", async () => {
    await expect(
      assertNotAlreadyExecuted({
        id: "i1",
        status: "FAILED",
      })
    ).rejects.toThrow(DuplicateExecutionError);
  });

  it("throws for CANCELED intent", async () => {
    await expect(
      assertNotAlreadyExecuted({
        id: "i1",
        status: "CANCELED",
      })
    ).rejects.toThrow(DuplicateExecutionError);
  });

  it("throws when duplicate provider payout exists", async () => {
    mockFindFirst.mockResolvedValue({ id: "i2" });

    await expect(
      assertNotAlreadyExecuted({
        id: "i1",
        status: "PENDING",
        providerPayoutId: "pp_1",
        circlePayoutId: null,
        onchainTxSig: null,
      })
    ).rejects.toThrow(DuplicateExecutionError);
  });

  it("DuplicateExecutionError has correct properties", () => {
    const err = new DuplicateExecutionError("i1", "status");
    expect(err.code).toBe("DUPLICATE_EXECUTION");
    expect(err.intentId).toBe("i1");
    expect(err.field).toBe("status");
  });
});

describe("assertOnchainTxNotDuplicate", () => {
  it("does not throw when no duplicate exists", async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      assertOnchainTxNotDuplicate("org_1", "txsig_abc")
    ).resolves.toBeUndefined();
  });

  it("throws when duplicate tx exists", async () => {
    mockFindFirst.mockResolvedValue({ id: "i2" });

    await expect(
      assertOnchainTxNotDuplicate("org_1", "txsig_abc")
    ).rejects.toThrow(DuplicateOnchainTxError);
  });

  it("does not throw for empty txSig", async () => {
    await expect(
      assertOnchainTxNotDuplicate("org_1", "")
    ).resolves.toBeUndefined();
  });

  it("excludes own intent from duplicate check", async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      assertOnchainTxNotDuplicate("org_1", "txsig_abc", "i1")
    ).resolves.toBeUndefined();
    
    const call = mockFindFirst.mock.calls[0][0];
    expect(call.where.id).toEqual({ not: "i1" });
  });

  it("DuplicateOnchainTxError has correct properties", () => {
    const err = new DuplicateOnchainTxError("txsig_abc");
    expect(err.code).toBe("DUPLICATE_ONCHAIN_TX");
    expect(err.txSig).toBe("txsig_abc");
  });
});
