import { describe, it, expect } from "vitest";
import { computeBackoffMs } from "@/server/jobs/payout-reconciler";

describe("payout-reconciler", () => {
  describe("computeBackoffMs", () => {
    it("returns 1 minute for retryCount=0", () => {
      expect(computeBackoffMs(0)).toBe(60_000);
    });

    it("returns 2 minutes for retryCount=1", () => {
      expect(computeBackoffMs(1)).toBe(120_000);
    });

    it("returns 4 minutes for retryCount=2", () => {
      expect(computeBackoffMs(2)).toBe(240_000);
    });

    it("returns 8 minutes for retryCount=3", () => {
      expect(computeBackoffMs(3)).toBe(480_000);
    });

    it("caps at 30 minutes for high retryCount", () => {
      expect(computeBackoffMs(10)).toBe(30 * 60 * 1000);
      expect(computeBackoffMs(20)).toBe(30 * 60 * 1000);
    });

    it("doubles each step up to the cap", () => {
      const b0 = computeBackoffMs(0);
      const b1 = computeBackoffMs(1);
      const b2 = computeBackoffMs(2);
      expect(b1).toBe(b0 * 2);
      expect(b2).toBe(b1 * 2);
    });
  });
});
