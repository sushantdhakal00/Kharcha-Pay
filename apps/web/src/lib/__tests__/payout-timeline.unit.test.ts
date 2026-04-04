import { describe, it, expect } from "vitest";
import { buildPayoutTimeline } from "../fiat/payout-timeline";

const baseIntent = {
  id: "intent-1",
  status: "COMPLETED" as const,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T02:00:00Z"),
  onchainTxSig: null,
  failureCode: null,
  failureMessage: null,
};

describe("payout-timeline", () => {
  describe("buildPayoutTimeline", () => {
    it("always starts with CREATED", () => {
      const timeline = buildPayoutTimeline(baseIntent, []);
      expect(timeline[0].action).toBe("CREATED");
      expect(timeline[0].timestamp).toBe("2026-01-01T00:00:00.000Z");
    });

    it("includes FUNDED_ONCHAIN from audit log", () => {
      const logs = [
        {
          action: "PAYOUT_FUNDED_ONCHAIN",
          createdAt: new Date("2026-01-01T00:10:00Z"),
          metadata: { txSig: "abc123" },
        },
      ];
      const timeline = buildPayoutTimeline(baseIntent, logs);
      const funded = timeline.find((e) => e.action === "FUNDED_ONCHAIN");
      expect(funded).toBeDefined();
      expect(funded!.metadata?.txSig).toBe("abc123");
    });

    it("includes status changes from audit log", () => {
      const logs = [
        {
          action: "PAYOUT_STATUS_CHANGED",
          createdAt: new Date("2026-01-01T00:30:00Z"),
          metadata: { from: "PENDING", to: "PROCESSING", source: "webhook" },
        },
        {
          action: "PAYOUT_STATUS_CHANGED",
          createdAt: new Date("2026-01-01T01:00:00Z"),
          metadata: { from: "PROCESSING", to: "COMPLETED", source: "reconciler" },
        },
      ];
      const timeline = buildPayoutTimeline(baseIntent, logs);
      expect(timeline).toHaveLength(3);
      expect(timeline[1].action).toBe("PROCESSING");
      expect(timeline[2].action).toBe("COMPLETED");
    });

    it("includes FAILED events with metadata", () => {
      const failedIntent = {
        ...baseIntent,
        status: "FAILED" as const,
        failureCode: "BANK_REJECTED",
        failureMessage: "Account closed",
      };
      const logs = [
        {
          action: "PAYOUT_FAILED",
          createdAt: new Date("2026-01-01T01:00:00Z"),
          metadata: { failureCode: "BANK_REJECTED", from: "PROCESSING" },
        },
      ];
      const timeline = buildPayoutTimeline(failedIntent, logs);
      const failed = timeline.find((e) => e.action === "FAILED");
      expect(failed).toBeDefined();
      expect(failed!.metadata?.failureCode).toBe("BANK_REJECTED");
    });

    it("includes WEBHOOK_RECEIVED events", () => {
      const logs = [
        {
          action: "WEBHOOK_RECEIVED",
          createdAt: new Date("2026-01-01T00:15:00Z"),
          metadata: { eventType: "payouts.completed" },
        },
      ];
      const timeline = buildPayoutTimeline(baseIntent, logs);
      const wh = timeline.find((e) => e.action === "WEBHOOK_RECEIVED");
      expect(wh).toBeDefined();
      expect(wh!.metadata?.eventType).toBe("payouts.completed");
    });

    it("sorts audit logs chronologically", () => {
      const logs = [
        {
          action: "PAYOUT_STATUS_CHANGED",
          createdAt: new Date("2026-01-01T01:00:00Z"),
          metadata: { from: "PROCESSING", to: "COMPLETED" },
        },
        {
          action: "PAYOUT_STATUS_CHANGED",
          createdAt: new Date("2026-01-01T00:30:00Z"),
          metadata: { from: "PENDING", to: "PROCESSING" },
        },
      ];
      const timeline = buildPayoutTimeline(baseIntent, logs);
      expect(timeline[1].action).toBe("PROCESSING");
      expect(timeline[2].action).toBe("COMPLETED");
    });

    it("deduplicates consecutive identical events", () => {
      const logs = [
        {
          action: "PAYOUT_STATUS_CHANGED",
          createdAt: new Date("2026-01-01T00:30:00Z"),
          metadata: { from: "PENDING", to: "PROCESSING" },
        },
        {
          action: "PAYOUT_STATUS_CHANGED",
          createdAt: new Date("2026-01-01T00:30:00Z"),
          metadata: { from: "PENDING", to: "PROCESSING" },
        },
      ];
      const timeline = buildPayoutTimeline(baseIntent, logs);
      const processingEvents = timeline.filter((e) => e.action === "PROCESSING");
      expect(processingEvents).toHaveLength(1);
    });

    it("adds terminal status fallback when no audit logs exist", () => {
      const timeline = buildPayoutTimeline(baseIntent, []);
      expect(timeline).toHaveLength(2);
      expect(timeline[0].action).toBe("CREATED");
      expect(timeline[1].action).toBe("COMPLETED");
    });

    it("handles CREATED intent with no audit logs", () => {
      const createdIntent = { ...baseIntent, status: "CREATED" as const };
      const timeline = buildPayoutTimeline(createdIntent, []);
      expect(timeline).toHaveLength(1);
      expect(timeline[0].action).toBe("CREATED");
    });

    it("handles string dates in intent", () => {
      const intentWithStrings = {
        ...baseIntent,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T02:00:00.000Z",
      };
      const timeline = buildPayoutTimeline(intentWithStrings, []);
      expect(timeline[0].timestamp).toBe("2026-01-01T00:00:00.000Z");
    });
  });
});
