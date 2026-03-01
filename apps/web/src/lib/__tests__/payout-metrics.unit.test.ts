import { describe, it, expect } from "vitest";
import {
  computeSuccessRate,
  computeAvgCompletionMs,
  aggregateDailyVolume,
  aggregateFailureBreakdown,
} from "../fiat/payout-metrics";

describe("payout-metrics", () => {
  describe("computeSuccessRate", () => {
    it("returns 0 when total is 0", () => {
      expect(computeSuccessRate(0, 0)).toBe(0);
    });

    it("returns 1 when all completed", () => {
      expect(computeSuccessRate(10, 10)).toBe(1);
    });

    it("returns correct ratio", () => {
      expect(computeSuccessRate(7, 10)).toBeCloseTo(0.7);
    });

    it("returns 0 when none completed", () => {
      expect(computeSuccessRate(0, 5)).toBe(0);
    });
  });

  describe("computeAvgCompletionMs", () => {
    it("returns 0 for empty array", () => {
      expect(computeAvgCompletionMs([])).toBe(0);
    });

    it("computes average correctly", () => {
      const payouts = [
        {
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T01:00:00Z"),
        },
        {
          createdAt: new Date("2026-01-02T00:00:00Z"),
          updatedAt: new Date("2026-01-02T02:00:00Z"),
        },
      ];
      const avg = computeAvgCompletionMs(payouts);
      expect(avg).toBe((3_600_000 + 7_200_000) / 2);
    });

    it("handles single payout", () => {
      const payouts = [
        {
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:30:00Z"),
        },
      ];
      expect(computeAvgCompletionMs(payouts)).toBe(30 * 60 * 1000);
    });
  });

  describe("aggregateDailyVolume", () => {
    it("returns empty for no intents", () => {
      expect(aggregateDailyVolume([])).toEqual([]);
    });

    it("groups by date", () => {
      const intents = [
        { createdAt: new Date("2026-01-15T10:00:00Z"), amountMinor: 10000n },
        { createdAt: new Date("2026-01-15T14:00:00Z"), amountMinor: 5000n },
        { createdAt: new Date("2026-01-16T09:00:00Z"), amountMinor: 20000n },
      ];
      const result = aggregateDailyVolume(intents);
      expect(result).toHaveLength(2);

      const jan15 = result.find((d) => d.date === "2026-01-15");
      expect(jan15).toBeDefined();
      expect(jan15!.volumeUsd).toBe(150);
      expect(jan15!.count).toBe(2);

      const jan16 = result.find((d) => d.date === "2026-01-16");
      expect(jan16).toBeDefined();
      expect(jan16!.volumeUsd).toBe(200);
      expect(jan16!.count).toBe(1);
    });

    it("handles BigInt amounts correctly", () => {
      const intents = [
        { createdAt: new Date("2026-02-01T00:00:00Z"), amountMinor: 1234567n },
      ];
      const result = aggregateDailyVolume(intents);
      expect(result[0].volumeUsd).toBeCloseTo(12345.67);
    });
  });

  describe("aggregateFailureBreakdown", () => {
    it("returns empty for no failures", () => {
      expect(aggregateFailureBreakdown([])).toEqual([]);
    });

    it("groups by failure code", () => {
      const failures = [
        { failureCode: "INSUFFICIENT_FUNDS" },
        { failureCode: "BANK_REJECTED" },
        { failureCode: "INSUFFICIENT_FUNDS" },
        { failureCode: null },
      ];
      const result = aggregateFailureBreakdown(failures);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ failureCode: "INSUFFICIENT_FUNDS", count: 2 });
    });

    it("uses UNKNOWN for null failure codes", () => {
      const failures = [
        { failureCode: null },
        { failureCode: null },
      ];
      const result = aggregateFailureBreakdown(failures);
      expect(result).toEqual([{ failureCode: "UNKNOWN", count: 2 }]);
    });

    it("sorts by count descending", () => {
      const failures = [
        { failureCode: "A" },
        { failureCode: "B" },
        { failureCode: "B" },
        { failureCode: "B" },
        { failureCode: "A" },
      ];
      const result = aggregateFailureBreakdown(failures);
      expect(result[0].failureCode).toBe("B");
      expect(result[0].count).toBe(3);
      expect(result[1].failureCode).toBe("A");
      expect(result[1].count).toBe(2);
    });
  });
});
