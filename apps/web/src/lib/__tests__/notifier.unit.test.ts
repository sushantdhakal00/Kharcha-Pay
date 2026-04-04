import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  _buildAlertSlackBlocks,
  _buildPayoutFailedSlackBlocks,
  _buildRetryStormSlackBlocks,
  _isNotificationsEnabled,
} from "../notifications/treasury-notifier";
import type { PayoutAlert } from "../fiat/payout-alerts";

describe("treasury-notifier", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isNotificationsEnabled", () => {
    it("returns false when not set", () => {
      delete process.env.INTERNAL_NOTIFICATIONS_ENABLED;
      expect(_isNotificationsEnabled()).toBe(false);
    });

    it("returns false when 'false'", () => {
      process.env.INTERNAL_NOTIFICATIONS_ENABLED = "false";
      expect(_isNotificationsEnabled()).toBe(false);
    });

    it("returns true when 'true'", () => {
      process.env.INTERNAL_NOTIFICATIONS_ENABLED = "true";
      expect(_isNotificationsEnabled()).toBe(true);
    });
  });

  describe("buildAlertSlackBlocks", () => {
    it("includes header with alert type", () => {
      const alert: PayoutAlert = {
        type: "HIGH_FAILURE_RATE",
        severity: "critical",
        message: "Failure rate is 30%",
        details: { failureRate: 0.3 },
      };
      const blocks = _buildAlertSlackBlocks(alert, "org_1");
      expect(blocks).toHaveLength(2);
      const header = blocks[0] as { type: string; text: { text: string } };
      expect(header.type).toBe("header");
      expect(header.text.text).toContain("HIGH_FAILURE_RATE");
    });

    it("uses warning emoji for warning severity", () => {
      const alert: PayoutAlert = {
        type: "STUCK_PAYOUTS",
        severity: "warning",
        message: "3 stuck",
        details: {},
      };
      const blocks = _buildAlertSlackBlocks(alert, "org_2");
      const header = blocks[0] as { text: { text: string } };
      expect(header.text.text).toContain("\u26A0\uFE0F");
    });

    it("includes org id in section", () => {
      const alert: PayoutAlert = {
        type: "RETRY_STORM",
        severity: "critical",
        message: "Storm",
        details: {},
      };
      const blocks = _buildAlertSlackBlocks(alert, "org_99");
      const section = blocks[1] as { text: { text: string } };
      expect(section.text.text).toContain("org_99");
    });
  });

  describe("buildPayoutFailedSlackBlocks", () => {
    it("includes intent id and amount", () => {
      const blocks = _buildPayoutFailedSlackBlocks({
        intentId: "pi_f1",
        orgId: "org_1",
        amountMinor: 25000n,
        currency: "USD",
        provider: "CIRCLE",
        failureCode: "INSUFFICIENT_FUNDS",
        failureMessage: "Not enough",
      });
      expect(blocks).toHaveLength(2);
      const section = blocks[1] as { text: { text: string } };
      expect(section.text.text).toContain("pi_f1");
      expect(section.text.text).toContain("250.00");
      expect(section.text.text).toContain("INSUFFICIENT_FUNDS");
    });

    it("omits failure fields when null", () => {
      const blocks = _buildPayoutFailedSlackBlocks({
        intentId: "pi_f2",
        orgId: "org_1",
        amountMinor: 100,
        currency: "USD",
        provider: "CIRCLE",
        failureCode: null,
        failureMessage: null,
      });
      const section = blocks[1] as { text: { text: string } };
      expect(section.text.text).not.toContain("*Code:*");
      expect(section.text.text).not.toContain("*Reason:*");
    });
  });

  describe("buildRetryStormSlackBlocks", () => {
    it("includes count and threshold", () => {
      const blocks = _buildRetryStormSlackBlocks("org_rs", {
        count: 5,
        retryThreshold: 3,
      });
      expect(blocks).toHaveLength(2);
      const section = blocks[1] as { text: { text: string } };
      expect(section.text.text).toContain("5");
      expect(section.text.text).toContain("3");
    });

    it("handles missing details gracefully", () => {
      const blocks = _buildRetryStormSlackBlocks("org_rs", {});
      const section = blocks[1] as { text: { text: string } };
      expect(section.text.text).toContain("?");
    });
  });
});
