import { describe, it, expect } from "vitest";
import {
  detectHighFailureRate,
  detectHighFailureRatePure,
} from "../fiat/payout-alerts";
import type { PayoutSuccessRateResult } from "../fiat/payout-metrics";

function makeMetrics(overrides: Partial<PayoutSuccessRateResult> = {}): PayoutSuccessRateResult {
  return {
    total: 100,
    completed: 90,
    failed: 5,
    canceled: 5,
    successRate: 0.9,
    ...overrides,
  };
}

describe("payout-alerts", () => {
  describe("detectHighFailureRate", () => {
    it("returns null when no payouts exist", () => {
      const result = detectHighFailureRate(makeMetrics({ total: 0, failed: 0 }));
      expect(result).toBeNull();
    });

    it("returns null when failure rate is below threshold", () => {
      const result = detectHighFailureRate(
        makeMetrics({ total: 100, failed: 5 }),
        0.1
      );
      expect(result).toBeNull();
    });

    it("returns warning when failure rate exceeds threshold", () => {
      const result = detectHighFailureRate(
        makeMetrics({ total: 100, failed: 15 }),
        0.1
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe("HIGH_FAILURE_RATE");
      expect(result!.severity).toBe("warning");
    });

    it("returns critical when failure rate exceeds 25%", () => {
      const result = detectHighFailureRate(
        makeMetrics({ total: 100, failed: 30 }),
        0.1
      );
      expect(result).not.toBeNull();
      expect(result!.severity).toBe("critical");
    });

    it("includes failure rate in details", () => {
      const result = detectHighFailureRate(
        makeMetrics({ total: 100, failed: 20 }),
        0.1
      );
      expect(result!.details.failureRate).toBeCloseTo(0.2);
      expect(result!.details.threshold).toBe(0.1);
    });

    it("uses default threshold of 0.1", () => {
      const belowThreshold = detectHighFailureRate(
        makeMetrics({ total: 100, failed: 9 })
      );
      expect(belowThreshold).toBeNull();

      const aboveThreshold = detectHighFailureRate(
        makeMetrics({ total: 100, failed: 11 })
      );
      expect(aboveThreshold).not.toBeNull();
    });
  });

  describe("detectHighFailureRatePure", () => {
    it("returns null for zero total", () => {
      expect(detectHighFailureRatePure(0, 0)).toBeNull();
    });

    it("detects high failure rate", () => {
      const result = detectHighFailureRatePure(20, 100, 0.1);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("HIGH_FAILURE_RATE");
    });

    it("returns null when below threshold", () => {
      const result = detectHighFailureRatePure(5, 100, 0.1);
      expect(result).toBeNull();
    });

    it("critical severity when > 25%", () => {
      const result = detectHighFailureRatePure(30, 100, 0.1);
      expect(result!.severity).toBe("critical");
    });

    it("warning severity when <= 25%", () => {
      const result = detectHighFailureRatePure(15, 100, 0.1);
      expect(result!.severity).toBe("warning");
    });

    it("message includes percentage", () => {
      const result = detectHighFailureRatePure(20, 100, 0.1);
      expect(result!.message).toContain("20.0%");
    });
  });
});
