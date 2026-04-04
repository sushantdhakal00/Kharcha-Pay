import { describe, it, expect } from "vitest";
import {
  mapCircleStatusToPayoutStatus,
  isPayoutEvent,
} from "../fiat/circle-webhook";
import {
  normalizeCircleStatus,
  mapCircleStatusToIntentStatus,
} from "../fiat/payout-providers/circle/circle-provider";

describe("webhook provider routing", () => {
  describe("Circle status normalization matches legacy mapping", () => {
    const testCases = [
      ["pending", "PENDING"],
      ["queued", "PENDING"],
      ["processing", "PROCESSING"],
      ["complete", "COMPLETED"],
      ["completed", "COMPLETED"],
      ["paid", "COMPLETED"],
      ["failed", "FAILED"],
      ["rejected", "FAILED"],
      ["returned", "FAILED"],
      ["canceled", "CANCELED"],
      ["cancelled", "CANCELED"],
    ] as const;

    for (const [raw, expected] of testCases) {
      it(`${raw} → ${expected} (new normalizer matches legacy)`, () => {
        const legacyResult = mapCircleStatusToPayoutStatus(raw);
        const newResult = normalizeCircleStatus(raw);
        expect(legacyResult).toBe(expected);
        expect(newResult).toBe(expected);
      });
    }
  });

  describe("mapCircleStatusToIntentStatus is consistent", () => {
    it("maps pending to PENDING", () => {
      expect(mapCircleStatusToIntentStatus("pending")).toBe("PENDING");
    });

    it("maps complete to COMPLETED", () => {
      expect(mapCircleStatusToIntentStatus("complete")).toBe("COMPLETED");
    });

    it("maps canceled to CANCELED", () => {
      expect(mapCircleStatusToIntentStatus("canceled")).toBe("CANCELED");
    });
  });

  describe("payout event identification still works", () => {
    it("identifies payouts.created as payout event", () => {
      expect(isPayoutEvent("payouts.created")).toBe(true);
    });

    it("identifies payouts.completed as payout event", () => {
      expect(isPayoutEvent("payouts.completed")).toBe(true);
    });

    it("identifies payouts.failed as payout event", () => {
      expect(isPayoutEvent("payouts.failed")).toBe(true);
    });

    it("does not identify transfer.complete as payout", () => {
      expect(isPayoutEvent("transfer.complete")).toBe(false);
    });
  });
});
